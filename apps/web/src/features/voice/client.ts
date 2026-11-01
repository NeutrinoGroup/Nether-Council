import { ServerMessage, Session, EncounterDraft, IdentityResult, type UiAction, type CharacterId, type ConfirmedTurn, type Locale, type SoulMood } from "@nether/contracts";
import { RECONNECT_DELAYS_MS, applyTranslation, encounterProgress, normalizeNickname, recordTurn, type DisplayCaption } from "@nether/party-core";
import { demoAction, demoAudio, demoLines } from "./demo";
import { AudioEngine } from "./audio/engine";
export type SoulSoupView = { mood: SoulMood; worries: string[]; ritual?: { callId: string; blessing: string } };
export type VoiceView = { soup?: SoulSoupView; demo?: boolean; demoReason?: string; demoAudioUnavailable?: boolean; sceneAction?: UiAction; scene?: { mood: "calm" | "warm" | "storm"; worry?: string; blessing?: string }; phase: "idle" | "permission" | "connecting" | "listening" | "speaking" | "reconnecting" | "ended" | "error"; caption?: DisplayCaption; userCaption?: DisplayCaption; error?: string; reconnects: number; muted: boolean; session?: Session; connectMs?: number; firstAudioMs?: number; stopMs?: number; interruptedAt?: number; userTurns: number; claimReady: boolean; canClaim: boolean; elapsedSeconds: number; draft?: EncounterDraft; result?: IdentityResult; finalizing?: boolean; endReason?: "user" | "claim" | "time_limit" | "background" | "language_change" | "character_change" | "next_guest" | "error" };
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
  private soulCalls = new Set<string>();
  private abort = new AbortController();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private deadlineTimer?: ReturnType<typeof setTimeout>;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private turns: ConfirmedTurn[] = [];
  private nickname = "";
  private progressTimer?: ReturnType<typeof setInterval>;
  private startedAt = 0;
  private result?: IdentityResult;
  private finishTimer?: ReturnType<typeof setTimeout>;
  private finishReason: "claim" | "time_limit" = "claim";
  private closingResponse?: string;
  private closingDone = false;
  private isPrewarming = false;
  private view: VoiceView = idleView;
  private demo = false;
  private demoStep = 0;
  private demoRevision = 0;
  private demoLocale: Locale = "zh";
  private demoId = crypto.randomUUID();
  private responseTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private heartbeatDeadline?: ReturnType<typeof setTimeout>;
  private appliedCalls = new Set<string>();
  constructor(private notify: (view: VoiceView) => void, private options: { demoFallback?: boolean; localVad?: boolean } = {}) {}
  private applyScene(payload: UiAction) {
    const soup = this.view.soup ?? { mood: "healing" as const, worries: [] };
    if (payload.action === "change_mood") {
      const mood = payload.data.mood;
      this.update({ soup: { ...soup, mood: mood === "storm" ? "angry_support" : mood === "warm" ? "laughing" : mood === "calm" ? "healing" : mood } });
    } else if (payload.action === "extract_worry") this.update({ soup: { ...soup, worries: [...new Set([...soup.worries, payload.data.worry])].slice(-3) } });
    else this.update({ soup: { ...soup, mood: "mystical", ritual: { callId: crypto.randomUUID(), blessing: payload.data.blessing } } });
    const scene = this.view.scene ?? { mood: "calm" as const };
    this.update({ sceneAction: payload, scene: payload.action === "change_mood" ? { ...scene, mood: (payload.data.mood === "storm" || payload.data.mood === "angry_support" ? "storm" : payload.data.mood === "warm" || payload.data.mood === "laughing" ? "warm" : "calm") } : payload.action === "extract_worry" ? { ...scene, worry: payload.data.worry, blessing: undefined } : { ...scene, mood: "warm", blessing: payload.data.blessing } });
  }
  private armFallback(reset = true) {
    if (!reset && this.responseTimer !== undefined) return;
    clearTimeout(this.responseTimer);
    if (this.options.demoFallback && !this.demo && !this.disposed && !this.isPrewarming) this.responseTimer = setTimeout(() => this.enterDemo("NETWORK_TIMEOUT"), 3000);
  }
  private clearNetworkTimers() {
    clearTimeout(this.responseTimer); clearTimeout(this.heartbeatDeadline); clearInterval(this.heartbeatTimer);
    this.heartbeatDeadline = undefined;
  }
  private localSpeech = () => { if (this.ready && this.audio.isPlaying() && !this.view.finalizing) this.interrupt(); };
  enterDemo(reason = "MANUAL", locale = this.view.session?.locale ?? this.demoLocale) {
    if (this.disposed || this.demo) return;
    this.demo = true; this.isPrewarming = false; this.ready = false; this.demoLocale = locale;
    this.send({ type: "session.end" });
    this.epoch++; this.demoRevision++;
    this.socket?.close(); this.socket = undefined; this.abort.abort();
    this.clearNetworkTimers(); clearTimeout(this.connectionTimer); clearTimeout(this.reconnectTimer); clearTimeout(this.deadlineTimer); clearTimeout(this.finishTimer); clearInterval(this.progressTimer);
    this.audio.stopCapture(); this.audio.clear(); this.activeResponse = undefined; this.turns = []; this.result = undefined;
    this.update({ demo: true, demoReason: reason, phase: "listening", session: undefined, result: undefined, draft: undefined, caption: undefined, userCaption: undefined, finalizing: false, muted: true, userTurns: 0, canClaim: false, claimReady: false, error: undefined });
    void this.demoReply(0);
  }
  private async demoReply(step: number) {
    const revision = ++this.demoRevision;
    this.demoStep = step; this.audio.clear();
    const locale = this.demoLocale;
    const text = demoLines[locale][step];
    this.applyScene(demoAction(locale, step));
    this.update({ phase: "listening", caption: { sessionId: this.demoId, epoch: this.epoch, responseId: `demo-${revision}`, segmentId: `demo-${revision}`, revision: 1, speaker: "character", sourceLocale: locale, sourceText: text, final: true } });
    try {
      await this.audio.prepareOutput();
      const audio = await demoAudio(locale, step);
      if (this.disposed || revision !== this.demoRevision) return;
      this.audio.play(audio); this.update({ phase: "speaking", demoAudioUnavailable: false });
    } catch {
      if (!this.disposed && revision === this.demoRevision) this.update({ phase: "listening", demoAudioUnavailable: true });
    }
  }
  submitText(text: string) {
    text = text.trim().slice(0, 600);
    if (!text || this.disposed || this.view.finalizing) return;
    if (this.demo) {
      this.update({ userCaption: { sessionId: this.demoId, epoch: this.epoch, responseId: `demo-user-${this.demoRevision}`, segmentId: `demo-user-${this.demoRevision}`, revision: 1, speaker: "user", sourceLocale: this.demoLocale, sourceText: text, final: true } });
      void this.demoReply(Math.min(2, this.demoStep + 1)); return;
    }
    if (!this.ready) return;
    this.interrupt(); this.armFallback(); this.send({ type: "text.submit", text });
  }
  private update(patch: Partial<VoiceView>) { this.view = { ...this.view, ...patch }; this.notify(this.view); }
  async prewarm(
    locale: Locale,
    invite: string,
    ref?: string,
    characterId: CharacterId = "meng-po",
    mode: "personal" | "host" = "personal"
  ) {
    if (this.disposed || this.socket) return;
    this.isPrewarming = true;
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: this.abort.signal,
        body: JSON.stringify({
          characterId,
          locale,
          invite,
          mode,
          ...(ref ? { ref } : {}),
        }),
      });
      if (!response.ok || this.disposed || this.demo) { this.isPrewarming = false; return; }
      const body = await response.json();
      const session = Session.parse(body.session);
      if (this.disposed || this.demo) return;
      this.update({ session });
      this.connect(true);
    } catch {
      this.isPrewarming = false;
    }
  }
  isPrewarmed(): boolean {
    return this.isPrewarming && this.socket?.readyState === WebSocket.OPEN && !this.disposed && Boolean(this.view.session);
  }
  async activate(nickname = "") {
    this.isPrewarming = false;
    this.armFallback();
    this.armFallback();
    this.demoLocale = this.view.session?.locale ?? this.demoLocale;
    this.nickname = normalizeNickname(nickname);
    this.startedAt = performance.now();
    this.update({ phase: "permission" });
    try {
      await this.audio.start(audio => {
        if (!this.ready || this.disposed || this.view.finalizing) return;
        if ((this.socket?.bufferedAmount ?? 0) > 64_000) return this.fail("UPLOAD_BACKLOG");
        this.send({ type: "audio.append", audio });
      }, this.options.localVad ? this.localSpeech : undefined);
      if (this.disposed || this.demo) { this.audio.stopCapture(); return; }
      this.update({ phase: "connecting" });
      const session = this.view.session;
      if (session) {
        this.progressTimer = setInterval(() => this.refreshProgress(), 1000);
        this.deadlineTimer = setTimeout(
          () => this.view.canClaim ? this.finish("time_limit") : this.stop("time_limit"),
          Math.max(0, session.captureUntil - Date.now())
        );
      }
      const history = this.turns.slice(-4).map(t => ({ role: t.speaker === "user" ? ("user" as const) : ("assistant" as const), text: t.text }));
      this.send({ type: "session.start", ...(history.length ? { resumeTurns: history, resumeUserTurns: this.view.userTurns, ritualCompleted: Boolean(this.view.soup?.ritual) } : {}) });
    } catch (error) {
      if (this.disposed || this.demo) return;
      this.fail(error instanceof DOMException && error.name === "NotAllowedError" ? "MICROPHONE_DENIED" : "CONNECTION_FAILED");
    }
  }
  async start(
    locale: Locale,
    invite: string,
    ref?: string,
    nickname = "",
    characterId: CharacterId = "meng-po",
    mode: "personal" | "host" = "personal",
    hostCredential?: string
  ) {
    if (this.isPrewarmed()) {
      return this.activate(nickname);
    }
    this.demoLocale = locale; this.armFallback();
    this.nickname = normalizeNickname(nickname);
    this.startedAt = performance.now(); this.update({ phase: "permission" });
    try {
      await this.audio.start(audio => {
        // Upload continues while model audio plays; only explicit mute pauses capture delivery.
        if (!this.ready || this.disposed || this.view.finalizing) return;
        if ((this.socket?.bufferedAmount ?? 0) > 64_000) return this.fail("UPLOAD_BACKLOG");
        this.send({ type: "audio.append", audio });
      }, this.options.localVad ? this.localSpeech : undefined);
      if (this.disposed || this.demo) { this.audio.stopCapture(); return; }
      this.update({ phase: "connecting" });
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: this.abort.signal,
        body: JSON.stringify({
          characterId,
          locale,
          invite,
          mode,
          ...(hostCredential ? { hostCredential } : {}),
          ...(ref ? { ref } : {}),
        }),
      });
      const body = await response.json();
      if (this.disposed || this.demo) return;
      if (!response.ok) return this.fail(typeof body.error === "string" ? body.error : "ADMISSION_FAILED");
      const session = Session.parse(body.session);
      if (this.disposed || this.demo) return;
      try {
        const cached = sessionStorage.getItem(`nc_result_${session.id}`);
        if (cached) {
          const result = IdentityResult.parse(JSON.parse(cached));
          if (result.sessionId === session.id && result.characterId === session.characterId) this.result = result;
        }
      } catch {}
      this.update({ session, ...(this.result ? { result: this.result } : {}) });
      this.progressTimer = setInterval(() => this.refreshProgress(), 1000);
      this.deadlineTimer = setTimeout(() => this.view.canClaim ? this.finish("time_limit") : this.stop("time_limit"), Math.max(0, session.captureUntil - Date.now()));
      this.connect();
    } catch (error) {
      if (this.disposed || this.demo) return;
      this.fail(error instanceof DOMException && error.name === "NotAllowedError" ? "MICROPHONE_DENIED" : "CONNECTION_FAILED");
    }
  }
  private connect(isPrewarm = false) {
    const session = this.view.session;
    if (this.disposed || this.demo || !session) return;
    this.armFallback(false);
    this.ready = false; this.seq = 0; this.lastSeq = -1;
    const epoch = this.epoch;
    const socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws`);
    this.socket = socket;
    const current = () => !this.disposed && !this.demo && socket === this.socket && epoch === this.epoch;
    let retryRequested = false;
    this.connectionTimer = setTimeout(() => { if (current()) { retryRequested = true; socket.close(); } }, 20000);
    socket.onopen = () => {
      const history = this.turns.slice(-4).map(t => ({ role: t.speaker === "user" ? "user" as const : "assistant" as const, text: t.text }));
      if (current()) {
        if (isPrewarm) {
          this.send({ type: "session.start", prewarm: true });
        } else {
          this.send({ type: "session.start", ...(history.length ? { resumeTurns: history, resumeUserTurns: this.view.userTurns, ritualCompleted: Boolean(this.view.soup?.ritual) } : {}) });
        }
      }
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
        if (this.options.demoFallback) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = setInterval(() => {
            if (!this.heartbeatDeadline) this.heartbeatDeadline = setTimeout(() => this.enterDemo("NETWORK_TIMEOUT"), 3000);
            this.send({ type: "ping" });
          }, 1000);
        }
        if (!this.isPrewarming) {
          this.update({ phase: "listening", connectMs: Math.round(performance.now() - this.startedAt) });
          this.telemetry("conversation_started");
        }
      } else if (event.type === "pong") {
        clearTimeout(this.heartbeatDeadline); this.heartbeatDeadline = undefined;
      } else if (event.type === "UI_ACTION") {
        if (this.canceled.has(event.responseId) || this.appliedCalls.has(event.callId) || event.responseId !== this.activeResponse || this.view.finalizing) return;
        this.appliedCalls.add(event.callId); this.applyScene(event.payload);
      } else if (event.type === "speech.stopped") {
        if (!this.view.finalizing) this.armFallback();
      } else if (event.type === "speech.started") {
        if (this.view.finalizing) return;
        clearTimeout(this.responseTimer);
        this.interrupt(); this.update({ phase: "listening", userCaption: undefined });
      } else if (event.type === "response.started") {
        if (this.view.finalizing && !this.result) { this.canceled.add(event.responseId); return; }
        this.armFallback();
        this.activeResponse = event.responseId; this.update({ caption: undefined });
        if (this.view.finalizing && this.result) this.closingResponse = event.responseId;
      } else if (event.type === "audio.delta") {
        if (this.canceled.has(event.responseId) || (this.view.finalizing && !this.result)) return;
        this.activeResponse = event.responseId;
        this.armFallback();
        try { this.audio.play(event.audio); } catch { return this.fail("PLAYBACK_FAILED"); }
        this.update({ phase: "speaking", ...(this.view.firstAudioMs === undefined ? { firstAudioMs: Math.round(performance.now() - this.startedAt) } : {}) });
      } else if (event.type === "soul.action") {
        if (session.characterId !== "meng-po" || this.canceled.has(event.responseId) || this.soulCalls.has(event.callId) || event.responseId !== this.activeResponse) return;
        this.soulCalls.add(event.callId);
        const soup = this.view.soup ?? { mood: "healing" as const, worries: [] };
        const action = event.action;
        if (action.name === "change_mood") this.update({ soup: { ...soup, mood: action.arguments.mood } });
        else if (action.name === "extract_worry_keyword" && !soup.ritual) this.update({ soup: { ...soup, worries: [...new Set([...soup.worries, action.arguments.keyword])].slice(-3) } });
        else if (action.name === "trigger_soul_soup_ritual" && !soup.ritual) this.update({ soup: { ...soup, mood: "mystical", ritual: { callId: event.callId, blessing: action.arguments.blessing_quote } } });
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
        if (!this.view.finalizing || this.result || event.result.sessionId !== session.id || event.result.characterId !== session.characterId) return;
        this.result = event.result;
        try { sessionStorage.setItem(`nc_result_${event.result.sessionId}`, JSON.stringify(event.result)); } catch {}
        this.update({ result: event.result });
      } else if (event.type === "response.done") {
        if (!this.canceled.has(event.responseId)) clearTimeout(this.responseTimer);
        if (this.view.finalizing && this.result && event.responseId === this.closingResponse) { this.closingDone = true; this.finishWhenDrained(); }
      } else if (event.type === "error") {
        if (this.view.finalizing) { this.stop(this.finishReason); return; }
        if (event.error.retryable) { retryRequested = true; socket.close(); } else this.fail(event.error.code);
      }
      // response.done marks generation, not the end of actual scheduled playback.
    };
    socket.onerror = () => { if (current()) { retryRequested = true; socket.close(); } };
    socket.onclose = ({ code }) => {
      if (!current()) return;
      if (this.isPrewarming) {
        this.isPrewarming = false;
        return;
      }
      this.clearNetworkTimers(); this.armFallback();
      clearTimeout(this.connectionTimer); this.ready = false; this.audio.clear(); this.activeResponse = undefined;
      this.update({ caption: undefined, userCaption: undefined });
      if (this.view.finalizing) return this.stop(this.finishReason);
      if ((code === 1000 && !retryRequested) || Date.now() >= session.captureUntil) return this.stop(Date.now() >= session.captureUntil ? "time_limit" : "user");
      if (this.view.reconnects >= RECONNECT_DELAYS_MS.length) return this.fail("RECONNECT_EXHAUSTED");
      const delay = RECONNECT_DELAYS_MS[this.view.reconnects] + Math.random() * 250;
      this.epoch++; this.canceled.clear(); this.appliedCalls.clear();
      this.update({ phase: "reconnecting", reconnects: this.view.reconnects + 1 });
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }
  private send(event: Record<string, unknown>) {
    if (this.disposed || !this.view.session || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: this.view.session.id, epoch: this.epoch, seq: this.seq++, ...event }));
  }
  interrupt() {
    const at = performance.now(); clearTimeout(this.responseTimer); this.audio.clear();
    if (this.demo) { this.demoRevision++; this.update({ phase: "listening", interruptedAt: at }); return; }
    if (this.activeResponse) { this.canceled.add(this.activeResponse); this.send({ type: "response.cancel", responseId: this.activeResponse }); this.activeResponse = undefined; }
    this.update({ phase: this.ready ? "listening" : this.view.phase, caption: undefined, interruptedAt: at, stopMs: Math.round(performance.now() - at) });
    if (this.view.finalizing && this.result) this.stop(this.finishReason);
  }
  mute(value: boolean) { this.audio.mute(value); this.update({ muted: value }); }
  analysers() { return this.audio.analysers(); }
  rms() { return this.audio.rms(); }
  measurePlayback() {
    this.finishWhenDrained();
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
  private finishWhenDrained() { if (this.view.finalizing && this.closingDone && !this.audio.isPlaying()) this.stop(this.finishReason); }
  finish(reason: "claim" | "time_limit" = "claim") {
    if (!this.view.canClaim || this.disposed || this.view.finalizing) return;
    this.finishReason = reason;
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) return this.stop(reason);
    this.interrupt(); this.audio.stopCapture();
    clearTimeout(this.deadlineTimer); clearInterval(this.progressTimer);
    this.update({ phase: "listening", finalizing: true, muted: true });
    this.finishTimer = setTimeout(() => this.stop(reason), Math.max(0, Math.min(55_000, this.view.session!.expiresAt - Date.now())));
    this.armFallback();
    this.send({ type: "session.finalize" });
  }
  private fail(error: string) { if (this.options.demoFallback && ["MICROPHONE_DENIED", "CONNECTION_FAILED", "PLAYBACK_FAILED", "RECONNECT_EXHAUSTED", "UPLOAD_BACKLOG"].includes(error)) { this.enterDemo(error); return; } this.stop("error"); this.update({ phase: "error", error }); }
  stop(reason: NonNullable<VoiceView["endReason"]> = "user") {
    if (this.disposed) return;
    let draft: EncounterDraft | undefined;
    const session = this.view.session;
    if (session && encounterProgress(this.turns, 0).canClaim && ["claim", "user", "time_limit"].includes(reason)) {
      draft = EncounterDraft.parse({ sessionId: session.id, characterId: session.characterId, locale: session.locale, nickname: this.nickname, createdAt: session.createdAt, endedAt: Date.now(), turns: this.turns.map(t => ({ ...t })) });
    }
    this.demoRevision++; this.clearNetworkTimers();
    this.send({ type: "session.end" }); this.disposed = true; this.ready = false;
    this.abort.abort(); clearInterval(this.progressTimer); clearTimeout(this.reconnectTimer); clearTimeout(this.deadlineTimer); clearTimeout(this.connectionTimer); clearTimeout(this.finishTimer);
    this.socket?.close(); this.audio.stop();
    this.update({ phase: "ended", caption: undefined, userCaption: undefined, draft, result: this.result, finalizing: false, endReason: reason });
  }
}
