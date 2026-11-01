import { afterEach, beforeEach, expect, test, vi } from "vitest";
const audio = vi.hoisted(() => ({ clear: vi.fn(), stop: vi.fn(), stopCapture: vi.fn(), play: vi.fn(), mute: vi.fn(), start: vi.fn(async () => {}), rms: vi.fn(() => 0), isPlaying: vi.fn(() => false) }));
vi.mock("../../apps/web/src/features/voice/audio/engine", () => ({ AudioEngine: class { start = audio.start; clear = audio.clear; stop = audio.stop; stopCapture = audio.stopCapture; play = audio.play; mute = audio.mute; rms = audio.rms; isPlaying = audio.isPlaying; } }));
import { VoiceClient, type VoiceView } from "../../apps/web/src/features/voice/client";
import type { Caption } from "@nether/contracts";
class Socket {
  static OPEN = 1; static instances: Socket[] = [];
  readyState = 1; bufferedAmount = 0; sent: Record<string, unknown>[] = [];
  onopen?: () => void; onclose?: (e: { code: number }) => void; onmessage?: (e: { data: string }) => void; onerror?: () => void;
  constructor() { Socket.instances.push(this); }
  send(text: string) { this.sent.push(JSON.parse(text)); }
  close() { this.readyState = 3; }
}
const id = "11111111-1111-4111-8111-111111111111";
let current: VoiceClient;
let session: { id: string; characterId: string; locale: string; mode: string; createdAt: number; captureUntil: number; expiresAt: number };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); Socket.instances = [];
  const now = Date.now(); session = { id, characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  vi.stubGlobal("location", { protocol: "https:", host: "example.test" }); vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ session }) })));
});
afterEach(() => { current?.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); });
test("three reconnects keep session identity and original capture deadline", async () => {
  let view: VoiceView | undefined; current = new VoiceClient(v => { view = v; });
  await current.start("en", "fixture");
  for (let attempt = 0; attempt <= 3; attempt++) {
    const socket = Socket.instances.at(-1)!; socket.onopen?.();
    expect(socket.sent[0]).toMatchObject({ type: "session.start", sessionId: id, epoch: attempt, seq: 0 });
    expect(view?.session?.expiresAt).toBe(session.expiresAt);
    socket.onclose?.({ code: 1011 });
    await vi.advanceTimersByTimeAsync(5000);
  }
  expect(Socket.instances).toHaveLength(4);
  expect(view).toMatchObject({ phase: "error", error: "RECONNECT_EXHAUSTED", reconnects: 3 });
  expect(audio.clear).toHaveBeenCalled(); expect(audio.stop).toHaveBeenCalled();
});
test("previous connection callbacks cannot inject audio after reconnect or restart", async () => {
  current = new VoiceClient(() => {}); await current.start("en", "fixture");
  const old = Socket.instances[0]; old.onclose?.({ code: 1011 });
  await vi.advanceTimersByTimeAsync(1500);
  const event = { protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: 0, type: "audio.delta", responseId: "late", audio: "AAA=" };
  old.onmessage?.({ data: JSON.stringify(event) }); expect(audio.play).not.toHaveBeenCalled();
  current.stop();
  Socket.instances.at(-1)?.onmessage?.({ data: JSON.stringify({ ...event, epoch: 1 }) });
  expect(audio.play).not.toHaveBeenCalled();
});
test("capture deadline prevents a reconnect from extending microphone use", async () => {
  let view: VoiceView | undefined; current = new VoiceClient(v => { view = v; }); await current.start("en", "fixture");
  Socket.instances[0].onclose?.({ code: 1011 }); await vi.advanceTimersByTimeAsync(180000);
  expect(view?.phase).toBe("ended"); expect(audio.stop).toHaveBeenCalled();
  const total = Socket.instances.length; await vi.advanceTimersByTimeAsync(30000); expect(Socket.instances).toHaveLength(total);
});
test("retryable provider errors reconnect even when the close handshake looks normal", async () => {
  let view: VoiceView | undefined; current = new VoiceClient(v => { view = v; }); await current.start("en", "fixture");
  const socket = Socket.instances[0]; socket.onopen?.();
  socket.onmessage?.({ data: JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: 0, type: "error", error: { code: "UPSTREAM_UNAVAILABLE", retryable: true, message: { zh: "稍后重试", en: "Retry shortly" } } }) });
  socket.onclose?.({ code: 1000 });
  await vi.advanceTimersByTimeAsync(1500);
  expect(Socket.instances).toHaveLength(2);
  expect(view).toMatchObject({ phase: "reconnecting", reconnects: 1, session: { expiresAt: session.expiresAt } });
});
test("story progress survives reconnect without resetting 75-second prompt or three-minute stop", async () => {
  let view: VoiceView | undefined; current = new VoiceClient(v => { view = v; });
  await current.start("en", "fixture", undefined, "  Pumpkin\u0000  ");
  const socket = Socket.instances[0]; let seq = 0;
  const send = (payload: object) => socket.onmessage?.({ data: JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: seq++, ...payload }) });
  const caption: Caption = { sessionId: id, epoch: 0, responseId: "u1", segmentId: "u1", revision: 1, sourceLocale: "en", sourceText: "I had five meetings and did no work.", speaker: "user", final: true };
  send({ type: "caption", caption }); send({ type: "caption", caption });
  expect(view).toMatchObject({ userTurns: 1, canClaim: true, claimReady: false });
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).not.toHaveProperty("nickname");
  socket.onclose?.({ code: 1011 }); await vi.advanceTimersByTimeAsync(1500);
  const next = Socket.instances[1]; next.onopen?.(); expect(next.sent[0]).toMatchObject({ resumeTurns: [{ role: "user", text: caption.sourceText }] });
  await vi.advanceTimersByTimeAsync(73_500); expect(view?.claimReady).toBe(true);
  await vi.advanceTimersByTimeAsync(105_000);
  expect(view).toMatchObject({ phase: "ended", endReason: "time_limit", draft: { nickname: "Pumpkin", sessionId: id, turns: [{ text: caption.sourceText }] } });
  expect(audio.stop).toHaveBeenCalled();
});
test("translations cannot revive old responses or cross a stop or connection epoch", async () => {
  let view: VoiceView | undefined; current = new VoiceClient(v => { view = v; }); await current.start("en", "fixture");
  const socket = Socket.instances[0]; let seq = 0;
  const send = (payload: object) => socket.onmessage?.({ data: JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: seq++, ...payload }) });
  const caption: Caption = { sessionId: id, epoch: 0, responseId: "a", segmentId: "a", revision: 1, sourceLocale: "en", sourceText: "Which meeting could have been soup?", speaker: "character", final: true };
  send({ type: "response.started", responseId: "a" }); send({ type: "caption", caption });
  send({ type: "caption.translation", translation: { ...caption, status: "ready", translatedText: "哪场会可以换成喝汤？" } });
  expect(view?.caption?.translatedText).toBe("哪场会可以换成喝汤？");
  send({ type: "response.started", responseId: "b" });
  send({ type: "caption.translation", translation: { ...caption, status: "ready", translatedText: "stale" } }); expect(view?.caption).toBeUndefined();
  send({ type: "caption", caption }); expect(view?.caption).toBeUndefined();
  const currentCaption = { ...caption, responseId: "b", segmentId: "b" }; send({ type: "caption", caption: currentCaption });
  current.interrupt(); send({ type: "caption.translation", translation: { ...currentCaption, status: "ready", translatedText: "cancelled" } }); expect(view?.caption).toBeUndefined();
  socket.onclose?.({ code: 1011 }); await vi.advanceTimersByTimeAsync(1500);
  send({ type: "caption", caption: { ...caption, speaker: "user" } }); expect(view?.userCaption).toBeUndefined();
  current.stop("language_change"); send({ type: "audio.delta", responseId: "c", audio: "AAA=" });
  expect(view).toMatchObject({ phase: "ended", endReason: "language_change" }); expect(audio.play).not.toHaveBeenCalled();
});
test("finish cannot fabricate a story and a valid finish releases microphone immediately", async () => {
  let view: VoiceView | undefined; current = new VoiceClient(v => { view = v; }); await current.start("en", "fixture");
  current.finish(); expect(audio.stop).not.toHaveBeenCalled();
  const socket = Socket.instances[0];
  socket.onmessage?.({ data: JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: 0, type: "caption", caption: { sessionId: id, epoch: 0, responseId: "u1", segmentId: "u1", revision: 1, sourceLocale: "en", sourceText: "My boss scheduled a midnight meeting.", speaker: "user", final: true } }) });
  current.finish(); expect(view).toMatchObject({ phase: "ended", endReason: "claim", draft: { turns: [{ speaker: "user" }] } }); expect(audio.stop).toHaveBeenCalledOnce();
});
test("delayed final result keeps the socket open and farewell drains before shutdown", async () => {
  let view: VoiceView | undefined; current = new VoiceClient(v => { view = v; }); await current.start("en", "fixture");
  const socket = Socket.instances[0]; let seq = 0;
  const send = (event: object) => socket.onmessage?.({ data: JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: seq++, ...event }) });
  send({ type: "session.ready", session });
  send({ type: "caption", caption: { sessionId: id, epoch: 0, responseId: "u1", segmentId: "u1", revision: 1, sourceLocale: "en", sourceText: "My boss scheduled a midnight meeting.", speaker: "user", final: true } });
  current.finish(); current.finish();
  expect(view?.finalizing).toBe(true); expect(audio.stopCapture).toHaveBeenCalledOnce();
  expect(socket.sent.filter(e => e.type === "session.finalize")).toHaveLength(1);
  expect(socket.sent.some(e => e.type === "session.end")).toBe(false);
  await vi.advanceTimersByTimeAsync(1500);
  const result = { id: crypto.randomUUID(), sessionId: id, characterId: "meng-po", generatedAt: Date.now(), fallback: false, title: { zh: "夜会散场官", en: "Midnight Meeting Adjourner" }, verdict: { zh: "把会议纪要留给南瓜汤。", en: "Leave the meeting notes in the soup." }, warmClosing: { zh: "今晚早点睡。", en: "Rest well tonight." }, tags: [{ zh: "散场", en: "Adjourned" }, { zh: "安睡", en: "Rest" }], sourceTurnIds: ["u1"] };
  send({ type: "result", result });
  expect(view?.result?.id).toBe(result.id);
  send({ type: "response.started", responseId: "farewell" }); audio.isPlaying.mockReturnValue(true);
  send({ type: "audio.delta", responseId: "farewell", audio: "AAA=" });
  send({ type: "response.done", responseId: "farewell" }); current.measurePlayback();
  expect(audio.stop).not.toHaveBeenCalled(); expect(view?.phase).toBe("speaking");
  audio.isPlaying.mockReturnValue(false); current.measurePlayback();
  expect(view).toMatchObject({ phase: "ended", endReason: "claim", result: { id: result.id } }); expect(audio.stop).toHaveBeenCalledOnce();
});

test("finalizing drops late old audio and wrong-session identity, then respects its hard limit", async () => {
  let view: VoiceView | undefined; current = new VoiceClient(v => { view = v; }); await current.start("en", "fixture");
  const socket = Socket.instances[0]; let seq = 0;
  const send = (event: object) => socket.onmessage?.({ data: JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: seq++, ...event }) });
  send({ type: "session.ready", session });
  send({ type: "caption", caption: { sessionId: id, epoch: 0, responseId: "u1", segmentId: "u1", revision: 1, sourceLocale: "en", sourceText: "My boss scheduled a midnight meeting.", speaker: "user", final: true } });
  current.finish();
  send({ type: "response.started", responseId: "late" });
  send({ type: "audio.delta", responseId: "late", audio: "AAA=" });
  send({ type: "result", result: { id: crypto.randomUUID(), sessionId: crypto.randomUUID(), characterId: "meng-po", generatedAt: Date.now(), fallback: false, title: { zh: "夜会散场官", en: "Midnight Meeting Adjourner" }, verdict: { zh: "把会议纪要留给南瓜汤。", en: "Leave the notes in the soup." }, warmClosing: { zh: "晚安。", en: "Good night." }, tags: [{ zh: "散场", en: "Adjourned" }, { zh: "安睡", en: "Rest" }], sourceTurnIds: ["u1"] } });
  expect(audio.play).not.toHaveBeenCalled(); expect(view?.result).toBeUndefined();
  await vi.advanceTimersByTimeAsync(54_999); expect(view?.finalizing).toBe(true);
  await vi.advanceTimersByTimeAsync(1); expect(view).toMatchObject({ phase: "ended", endReason: "claim", draft: { sessionId: id } });
  expect(audio.stop).toHaveBeenCalledOnce();
});
