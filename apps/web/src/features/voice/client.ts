import { ServerMessage, Session, type Caption, type Locale } from "@nether/contracts";
import { RECONNECT_DELAYS_MS } from "@nether/party-core";
import { AudioEngine } from "./audio/engine";
export type VoiceView = { phase: "idle" | "permission" | "connecting" | "listening" | "speaking" | "reconnecting" | "ended" | "error"; caption?: Caption; userCaption?: Caption; error?: string; reconnects: number; muted: boolean; session?: Session; connectMs?: number; firstAudioMs?: number; stopMs?: number };
export const idleView: VoiceView = { phase: "idle", reconnects: 0, muted: false };
export class VoiceClient {
  private audio = new AudioEngine();
  private socket?: WebSocket;
  private disposed = false;
  private ready = false;
  private epoch = 0;
  private seq = 0;
  private lastSeq = -1;
  private activeResponse?: string;
  private canceled = new Set<string>();
  private abort = new AbortController();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private deadlineTimer?: ReturnType<typeof setTimeout>;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private history: { role: "user" | "assistant"; text: string }[] = [];
  private confirmedSegments = new Set<string>();
  private startedAt = 0;
  private view: VoiceView = idleView;
  constructor(private notify: (view: VoiceView) => void) {}
  private update(patch: Partial<VoiceView>) { this.view = { ...this.view, ...patch }; this.notify(this.view); }
  async start(locale: Locale, invite: string, ref?: string) {
    this.startedAt = performance.now(); this.update({ phase: "permission" });
    try {
      await this.audio.start(audio => {
        // Upload continues while model audio plays; only explicit mute pauses capture delivery.
        if (!this.ready || this.disposed) return;
        if ((this.socket?.bufferedAmount ?? 0) > 64_000) return this.fail("UPLOAD_BACKLOG");
        this.send({ type: "audio.append", audio });
      });
      if (this.disposed) return;
      this.update({ phase: "connecting" });
      const response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, signal: this.abort.signal, body: JSON.stringify({ characterId: "meng-po", locale, invite, ...(ref ? { ref } : {}) }) });
      const body = await response.json();
      if (!response.ok) return this.fail(typeof body.error === "string" ? body.error : "ADMISSION_FAILED");
      const session = Session.parse(body.session);
      if (this.disposed) return;
      this.update({ session });
      this.deadlineTimer = setTimeout(() => this.stop(), Math.max(0, session.captureUntil - Date.now()));
      this.connect();
    } catch (error) {
      if (this.disposed) return;
      this.fail(error instanceof DOMException && error.name === "NotAllowedError" ? "MICROPHONE_DENIED" : "CONNECTION_FAILED");
    }
  }
  private connect() {
    const session = this.view.session;
    if (this.disposed || !session) return;
    this.ready = false; this.seq = 0; this.lastSeq = -1;
    const epoch = this.epoch;
    const socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws`);
    this.socket = socket;
    const current = () => !this.disposed && socket === this.socket && epoch === this.epoch;
    this.connectionTimer = setTimeout(() => { if (current()) socket.close(); }, 20000);
    socket.onopen = () => { if (current()) this.send({ type: "session.start", ...(this.history.length ? { resumeTurns: this.history } : {}) }); };
    socket.onmessage = ({ data }) => {
      if (!current()) return;
      let event;
      try { event = ServerMessage.parse(JSON.parse(data)); } catch { return this.fail("INVALID_PROTOCOL"); }
      if (event.sessionId !== session.id || event.epoch !== epoch || event.seq <= this.lastSeq) return;
      this.lastSeq = event.seq;
      if (event.type === "session.ready") {
        if (event.session.id !== session.id || event.session.expiresAt !== session.expiresAt) return this.fail("INVALID_PROTOCOL");
        clearTimeout(this.connectionTimer); this.ready = true;
        this.update({ phase: "listening", connectMs: Math.round(performance.now() - this.startedAt) });
        this.telemetry("conversation_started");
      } else if (event.type === "speech.started") {
        this.interrupt(); this.update({ phase: "listening" });
      } else if (event.type === "audio.delta") {
        if (this.canceled.has(event.responseId)) return;
        this.activeResponse = event.responseId;
        try { this.audio.play(event.audio); } catch { return this.fail("PLAYBACK_FAILED"); }
        this.update({ phase: "speaking", ...(this.view.firstAudioMs === undefined ? { firstAudioMs: Math.round(performance.now() - this.startedAt) } : {}) });
      } else if (event.type === "caption") {
        const caption = event.caption;
        if (caption.sessionId !== session.id || caption.epoch !== epoch || this.canceled.has(caption.responseId)) return;
        const previous = caption.speaker === "user" ? this.view.userCaption : this.view.caption;
        if (previous?.segmentId === caption.segmentId && previous.revision >= caption.revision) return;
        if (caption.final && !this.confirmedSegments.has(caption.segmentId)) {
          this.confirmedSegments.add(caption.segmentId);
          this.history.push({ role: caption.speaker === "user" ? "user" : "assistant", text: caption.sourceText.slice(0, 600) }); this.history = this.history.slice(-4);
        }
        this.update(caption.speaker === "user" ? { userCaption: caption } : { caption });
      } else if (event.type === "error") {
        if (event.error.retryable) socket.close(); else this.fail(event.error.code);
      }
      // response.done marks generation, not the end of actual scheduled playback.
    };
    socket.onerror = () => { if (current()) socket.close(); };
    socket.onclose = ({ code }) => {
      if (!current()) return;
      clearTimeout(this.connectionTimer); this.ready = false; this.audio.clear(); this.activeResponse = undefined;
      this.update({ caption: undefined });
      if (code === 1000 || Date.now() >= session.captureUntil) return this.stop();
      if (this.view.reconnects >= RECONNECT_DELAYS_MS.length) return this.fail("RECONNECT_EXHAUSTED");
      const delay = RECONNECT_DELAYS_MS[this.view.reconnects] + Math.random() * 250;
      this.epoch++; this.canceled.clear();
      this.update({ phase: "reconnecting", reconnects: this.view.reconnects + 1 });
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }
  private send(event: Record<string, unknown>) {
    if (this.disposed || !this.view.session || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: this.view.session.id, epoch: this.epoch, seq: this.seq++, ...event }));
  }
  interrupt() {
    const at = performance.now(); this.audio.clear();
    if (this.activeResponse) { this.canceled.add(this.activeResponse); this.send({ type: "response.cancel", responseId: this.activeResponse }); this.activeResponse = undefined; }
    this.update({ phase: this.ready ? "listening" : this.view.phase, caption: undefined, stopMs: Math.round(performance.now() - at) });
  }
  mute(value: boolean) { this.audio.mute(value); this.update({ muted: value }); }
  rms() { return this.audio.rms(); }
  measurePlayback() {
    if (this.view.phase === "speaking" && !this.audio.isPlaying()) this.update({ phase: "listening" });
    return this.audio.rms();
  }
  settings() { return this.audio.settings(); }
  private telemetry(name: "conversation_started") {
    const session = this.view.session;
    if (session) void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: crypto.randomUUID(), sessionId: session.id, name, at: Date.now() }), keepalive: true }).catch(() => {});
  }
  private fail(error: string) { this.stop(); this.update({ phase: "error", error }); }
  stop() {
    if (this.disposed) return;
    this.send({ type: "session.end" }); this.disposed = true; this.ready = false;
    this.abort.abort(); clearTimeout(this.reconnectTimer); clearTimeout(this.deadlineTimer); clearTimeout(this.connectionTimer);
    this.socket?.close(); this.audio.stop();
    this.update({ phase: "ended", caption: undefined });
  }
}
