import { ServerMessage, Session, EncounterDraft, IdentityResult, type CharacterId, type ConfirmedTurn, type Locale } from "@nether/contracts";
import { RECONNECT_DELAYS_MS, applyTranslation, encounterProgress, normalizeNickname, recordTurn, type DisplayCaption } from "@nether/party-core";
import { AudioEngine } from "./audio/engine";
export type VoiceView = { phase: "idle" | "permission" | "connecting" | "listening" | "speaking" | "reconnecting" | "ended" | "error"; caption?: DisplayCaption; userCaption?: DisplayCaption; error?: string; reconnects: number; muted: boolean; session?: Session; connectMs?: number; firstAudioMs?: number; stopMs?: number; interruptedAt?: number; userTurns: number; claimReady: boolean; canClaim: boolean; elapsedSeconds: number; draft?: EncounterDraft; result?: IdentityResult; finalizing?: boolean; endReason?: "user" | "claim" | "time_limit" | "background" | "language_change" | "character_change" | "error" };
export const idleView: VoiceView = { phase: "idle", reconnects: 0, muted: false, userTurns: 0, claimReady: false, canClaim: false, elapsedSeconds: 0 };
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
  private turns: ConfirmedTurn[] = [];
  private nickname = "";
  private progressTimer?: ReturnType<typeof setInterval>;
  private startedAt = 0;
  private result?: IdentityResult;
  private view: VoiceView = idleView;
  constructor(private notify: (view: VoiceView) => void) {}
  private update(patch: Partial<VoiceView>) { this.view = { ...this.view, ...patch }; this.notify(this.view); }
  async start(locale: Locale, invite: string, ref?: string, nickname = "", characterId: CharacterId = "meng-po") {
    this.nickname = normalizeNickname(nickname);
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
      const response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, signal: this.abort.signal, body: JSON.stringify({ characterId, locale, invite, ...(ref ? { ref } : {}) }) });
      const body = await response.json();
      if (!response.ok) return this.fail(typeof body.error === "string" ? body.error : "ADMISSION_FAILED");
      const session = Session.parse(body.session);
      if (this.disposed) return;
      try {
        const cached = sessionStorage.getItem(`nc_result_${session.id}`);
        if (cached) this.result = IdentityResult.parse(JSON.parse(cached));
      } catch {}
      this.update({ session, ...(this.result ? { result: this.result } : {}) });
      this.progressTimer = setInterval(() => this.refreshProgress(), 1000);
      this.deadlineTimer = setTimeout(() => this.stop("time_limit"), Math.max(0, session.captureUntil - Date.now()));
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
    let retryRequested = false;
    this.connectionTimer = setTimeout(() => { if (current()) { retryRequested = true; socket.close(); } }, 20000);
    socket.onopen = () => {
      const history = this.turns.slice(-4).map(t => ({ role: t.speaker === "user" ? "user" as const : "assistant" as const, text: t.text }));
      if (current()) this.send({ type: "session.start", ...(history.length ? { resumeTurns: history } : {}) });
    };
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
        this.interrupt(); this.update({ phase: "listening", userCaption: undefined });
      } else if (event.type === "response.started") {
        this.activeResponse = event.responseId; this.update({ caption: undefined });
      } else if (event.type === "audio.delta") {
        if (this.canceled.has(event.responseId)) return;
        this.activeResponse = event.responseId;
        try { this.audio.play(event.audio); } catch { return this.fail("PLAYBACK_FAILED"); }
        this.update({ phase: "speaking", ...(this.view.firstAudioMs === undefined ? { firstAudioMs: Math.round(performance.now() - this.startedAt) } : {}) });
      } else if (event.type === "caption") {
        const caption = event.caption;
        if (caption.sessionId !== session.id || caption.epoch !== epoch || this.canceled.has(caption.responseId)) return;
        if (caption.speaker === "character" && this.activeResponse && caption.responseId !== this.activeResponse) return;
        const previous = caption.speaker === "user" ? this.view.userCaption : this.view.caption;
        if (previous?.segmentId === caption.segmentId && previous.revision >= caption.revision) return;
        this.turns = recordTurn(this.turns, caption);
        const display = { ...caption, translationStatus: caption.final ? "pending" as const : undefined };
        this.update(caption.speaker === "user" ? { userCaption: display } : { caption: display });
        this.refreshProgress();
      } else if (event.type === "caption.translation") {
        const translation = event.translation;
        if (this.canceled.has(translation.responseId)) return;
        if (translation.speaker === "user") this.update({ userCaption: applyTranslation(this.view.userCaption, translation) });
        else this.update({ caption: applyTranslation(this.view.caption, translation) });
      } else if (event.type === "result") {
        this.result = event.result;
        try { sessionStorage.setItem(`nc_result_${event.result.sessionId}`, JSON.stringify(event.result)); } catch {}
        this.update({ result: event.result, finalizing: false });
      } else if (event.type === "error") {
        if (event.error.retryable) { retryRequested = true; socket.close(); } else this.fail(event.error.code);
      }
      // response.done marks generation, not the end of actual scheduled playback.
    };
    socket.onerror = () => { if (current()) { retryRequested = true; socket.close(); } };
    socket.onclose = ({ code }) => {
      if (!current()) return;
      clearTimeout(this.connectionTimer); this.ready = false; this.audio.clear(); this.activeResponse = undefined;
      this.update({ caption: undefined, userCaption: undefined });
      if ((code === 1000 && !retryRequested) || Date.now() >= session.captureUntil) return this.stop(Date.now() >= session.captureUntil ? "time_limit" : "user");
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
    this.update({ phase: this.ready ? "listening" : this.view.phase, caption: undefined, interruptedAt: at, stopMs: Math.round(performance.now() - at) });
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
  private refreshProgress() {
    const elapsed = Math.max(0, Date.now() - (this.view.session?.createdAt ?? Date.now()));
    this.update({ ...encounterProgress(this.turns, elapsed), elapsedSeconds: Math.floor(elapsed / 1000) });
  }
  finish() {
    if (this.view.canClaim) {
      this.send({ type: "session.finalize" });
      this.stop("claim");
    }
  }
  private fail(error: string) { this.stop("error"); this.update({ phase: "error", error }); }
  stop(reason: NonNullable<VoiceView["endReason"]> = "user") {
    if (this.disposed) return;
    let draft: EncounterDraft | undefined;
    const session = this.view.session;
    if (session && encounterProgress(this.turns, 0).canClaim && ["claim", "user", "time_limit"].includes(reason)) {
      draft = EncounterDraft.parse({ sessionId: session.id, characterId: session.characterId, locale: session.locale, nickname: this.nickname, createdAt: session.createdAt, endedAt: Date.now(), turns: this.turns.map(t => ({ ...t })) });
    }
    this.send({ type: "session.end" }); this.disposed = true; this.ready = false;
    this.abort.abort(); clearInterval(this.progressTimer); clearTimeout(this.reconnectTimer); clearTimeout(this.deadlineTimer); clearTimeout(this.connectionTimer);
    this.socket?.close(); this.audio.stop();
    this.update({ phase: "ended", caption: undefined, userCaption: undefined, draft, result: this.result, finalizing: false, endReason: reason });
  }
}
