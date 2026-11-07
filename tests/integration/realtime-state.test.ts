import { afterEach, beforeEach, expect, test, vi } from "vitest";
const audio = vi.hoisted(() => ({ clear: vi.fn(), stop: vi.fn(), stopCapture: vi.fn(), prepareOutput: vi.fn(async () => {}), play: vi.fn(), mute: vi.fn(), start: vi.fn(async () => {}), rms: vi.fn(() => 0), isPlaying: vi.fn(() => false) }));
vi.mock("../../apps/web/src/features/voice/audio/engine", () => ({ AudioEngine: class { start = audio.start; prepareOutput = audio.prepareOutput; clear = audio.clear; stop = audio.stop; stopCapture = audio.stopCapture; play = audio.play; mute = audio.mute; rms = audio.rms; isPlaying = audio.isPlaying; } }));
import { VoiceClient, type VoiceView } from "../../apps/web/src/features/voice/client";
class Socket {
  static OPEN = 1; static instances: Socket[] = [];
  readyState = 1; bufferedAmount = 0; sent: Record<string, unknown>[] = [];
  onopen?: () => void; onclose?: (e: { code: number }) => void; onmessage?: (e: { data: string }) => void;
  constructor() { Socket.instances.push(this); }
  send(text: string) { this.sent.push(JSON.parse(text)); }
  close() { this.readyState = 3; }
}
let client: VoiceClient; let view: VoiceView;
let session: { id: string; characterId: string; locale: string; mode: string; createdAt: number; captureUntil: number; expiresAt: number };
let seq = 0;
const send = (event: object, socket = Socket.instances.at(-1)!) => socket.onmessage?.({ data: JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: session.id, epoch: 0, seq: seq++, ...event }) });
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); audio.isPlaying.mockReturnValue(false); Socket.instances = []; seq = 0;
  const now = Date.now(); session = { id: crypto.randomUUID(), characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  vi.stubGlobal("location", { protocol: "https:", host: "example.test" }); vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path.startsWith("/demo/") ? { ok: true, arrayBuffer: async () => new Uint8Array([1, 0, 2, 0]).buffer } : { ok: true, json: async () => ({ session }) }));
  client = new VoiceClient(v => { view = v; }, { demoFallback: true, localVad: true });
});
afterEach(() => { client.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); });

test("opt-in fallback waits 15s; stale provider events cannot revive audio or actions", async () => {
  await client.start("en", "fixture");
  const old = Socket.instances[0];
  await vi.advanceTimersByTimeAsync(14999); expect(view.demo).not.toBe(true);
  await vi.advanceTimersByTimeAsync(1); expect(view).toMatchObject({ demo: true, demoReason: "NETWORK_TIMEOUT", phase: "speaking" });
  expect(audio.stopCapture).toHaveBeenCalled(); expect(old.readyState).toBe(3);
  const calls = audio.play.mock.calls.length;
  send({ type: "audio.delta", responseId: "late", audio: "AAA=" }, old);
  send({ type: "UI_ACTION", responseId: "late", callId: "late", payload: { action: "change_mood", data: { mood: "storm" } } }, old);
  expect(audio.play).toHaveBeenCalledTimes(calls); expect(view.scene?.mood).toBe("warm");
  client.submitText("Too many meetings"); await vi.advanceTimersByTimeAsync(0);
  expect(view.scene?.worry).toBe("Endless meetings"); expect(view.canClaim).toBe(false);
  client.submitText("Let it go"); await vi.advanceTimersByTimeAsync(0);
  expect(view.scene?.blessing).toBe("May tomorrow feel lighter"); expect(view.result).toBeUndefined();
  expect(old.sent.some(event => event.type === "session.end")).toBe(true);
});

test("denied microphone enters local demo without admitting a paid session", async () => {
  audio.start.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
  await client.start("en", "fixture"); await vi.advanceTimersByTimeAsync(0);
  expect(view).toMatchObject({ demo: true, demoReason: "MICROPHONE_DENIED", phase: "speaking" });
  expect(Socket.instances).toHaveLength(0);
  expect(vi.mocked(fetch).mock.calls.every(([path]) => String(path).startsWith("/demo/"))).toBe(true);
});

test("manual demo requires neither permission nor a session; pending clip cannot play after interrupt or stop", async () => {
  let resolve: (() => void) | undefined;
  audio.prepareOutput.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
  client.enterDemo("MANUAL", "zh"); client.interrupt(); resolve!(); await vi.advanceTimersByTimeAsync(0);
  expect(audio.start).not.toHaveBeenCalled(); expect(audio.play).not.toHaveBeenCalled();
  client.submitText("请继续"); client.stop(); await vi.advanceTimersByTimeAsync(0);
  expect(audio.play).not.toHaveBeenCalled(); expect(view.phase).toBe("ended");
});

test("UI commands are exactly once, response-scoped and canceled with speech; local VAD clears playback", async () => {
  await client.start("en", "fixture"); send({ type: "session.ready", session });
  send({ type: "response.started", responseId: "r1" });
  const action = { type: "UI_ACTION", responseId: "r1", callId: "c1", payload: { action: "extract_worry", data: { worry: "deadlines" } } };
  send(action); expect(view.scene?.worry).toBe("deadlines");
  send({ ...action, payload: { action: "extract_worry", data: { worry: "duplicate" } } }); expect(view.scene?.worry).toBe("deadlines");
  audio.isPlaying.mockReturnValue(true);
  const onSpeech = (audio.start.mock.calls as unknown as [unknown, () => void][])[0][1]; onSpeech();
  expect(audio.clear).toHaveBeenCalled(); expect(view.phase).toBe("listening");
  send({ ...action, callId: "late", payload: { action: "change_mood", data: { mood: "storm" } } });
  expect(view.scene?.mood).toBe("calm");
  expect(Socket.instances[0].sent.some(event => event.type === "response.cancel")).toBe(true);
});

test("normal silence stays live with pongs; speech-stopped starts the reply deadline", async () => {
  await client.start("en", "fixture"); send({ type: "session.ready", session });
  send({ type: "response.started", responseId: "r1" }); send({ type: "response.done", responseId: "r1" });
  for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(1000); send({ type: "pong" }); }
  expect(view.demo).not.toBe(true);
  send({ type: "speech.stopped" }); await vi.advanceTimersByTimeAsync(14999); expect(view.demo).not.toBe(true);
  await vi.advanceTimersByTimeAsync(1); expect(view.demo).toBe(true);
});

test("opt-in heartbeat fallback waits 15s for pong; live text uses the typed transport", async () => {
  await client.start("en", "fixture"); send({ type: "session.ready", session });
  send({ type: "response.started", responseId: "r1" }); send({ type: "response.done", responseId: "r1" });
  client.submitText(" hello "); expect(Socket.instances[0].sent).toContainEqual(expect.objectContaining({ type: "text.submit", text: "hello" }));
  send({ type: "response.started", responseId: "r2" }); send({ type: "response.done", responseId: "r2" });
  await vi.advanceTimersByTimeAsync(15999); expect(view.demo).not.toBe(true);
  await vi.advanceTimersByTimeAsync(1); expect(view.demo).toBe(true);
});

test("permission completion after timeout cannot reconnect or retain microphone capture", async () => {
  let allow: (() => void) | undefined;
  audio.start.mockImplementationOnce(() => new Promise<void>(resolve => { allow = resolve; }));
  const starting = client.start("en", "fixture");
  await vi.advanceTimersByTimeAsync(14999); expect(view.demo).not.toBe(true);
  await vi.advanceTimersByTimeAsync(1); expect(view.demo).toBe(true);
  const stops = audio.stopCapture.mock.calls.length;
  allow!(); await starting;
  expect(audio.stopCapture.mock.calls.length).toBeGreaterThan(stops);
  expect(Socket.instances).toHaveLength(0);
});

function liveClient() {
  client = new VoiceClient(v => { view = v; }, { demoFallback: false, networkTimeoutMs: 15000, permissionTimeoutMs: 15000 });
}

function expectNoDemo() {
  expect(view.demo).not.toBe(true);
  expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).startsWith("/demo/"))).toBe(false);
}

test("live connection permits a 25s upstream handshake and delayed first audio without demo", async () => {
  liveClient();
  await client.start("en", "fixture");
  const socket = Socket.instances[0]; socket.onopen?.();
  await vi.advanceTimersByTimeAsync(26000);
  expect(socket.readyState).toBe(Socket.OPEN);
  expect(view.phase).toBe("connecting");
  send({ type: "session.ready", session });
  send({ type: "response.started", responseId: "slow" });
  await vi.advanceTimersByTimeAsync(20000);
  expectNoDemo();
  send({ type: "audio.delta", responseId: "slow", audio: "AAE=" });
  expect(view.phase).toBe("speaking");
  expect(audio.play).toHaveBeenCalledExactlyOnceWith("AAE=");
});

test("live reconnect keeps the same session and resumes provider audio without demo", async () => {
  liveClient();
  await client.start("en", "fixture"); send({ type: "session.ready", session });
  const old = Socket.instances[0]; old.close(); old.onclose?.({ code: 1006 });
  expect(view).toMatchObject({ phase: "reconnecting", reconnects: 1 });
  await vi.advanceTimersByTimeAsync(5000);
  const next = Socket.instances[1]; next.onopen?.();
  expect(next.sent[0]).toMatchObject({ type: "session.start", sessionId: session.id, epoch: 1 });
  send({ type: "session.ready", session, epoch: 1, seq: 0 }, next);
  send({ type: "audio.delta", responseId: "resumed", audio: "AAE=", epoch: 1, seq: 1 }, next);
  expect(view).toMatchObject({ phase: "speaking", session });
  expectNoDemo();
});

test("denied live microphone reports an error and never admits a session or plays demo", async () => {
  liveClient(); audio.start.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
  await client.start("en", "fixture");
  expect(view).toMatchObject({ phase: "error", error: "MICROPHONE_DENIED" });
  expect(audio.stop).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled(); expect(audio.play).not.toHaveBeenCalled();
  expectNoDemo();
});

test("live permission times out cleanly after 15s and ignores a late permission grant", async () => {
  liveClient();
  let allow!: () => void;
  audio.start.mockImplementationOnce(() => new Promise<void>(resolve => { allow = resolve; }));
  const starting = client.start("en", "fixture");
  await vi.advanceTimersByTimeAsync(14999); expect(view.phase).toBe("permission");
  await vi.advanceTimersByTimeAsync(1);
  expect(view).toMatchObject({ phase: "error", error: "MICROPHONE_TIMEOUT" });
  allow(); await starting;
  expect(audio.stopCapture).toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  expectNoDemo();
});

test("live admission times out after 15s, aborts fetch and ignores its late result", async () => {
  liveClient();
  let admit!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(resolve => { admit = resolve; }));
  const starting = client.start("en", "fixture");
  await vi.advanceTimersByTimeAsync(14999); expect(view.phase).toBe("connecting");
  await vi.advanceTimersByTimeAsync(1);
  expect(view).toMatchObject({ phase: "error", error: "NETWORK_TIMEOUT" });
  expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  admit(new Response(JSON.stringify({ session }))); await starting;
  expect(Socket.instances).toHaveLength(0); expectNoDemo();
});

test("manual demo remains available with automatic fallback disabled", async () => {
  liveClient(); client.enterDemo("MANUAL", "zh"); await vi.advanceTimersByTimeAsync(0);
  expect(view).toMatchObject({ demo: true, demoReason: "MANUAL", phase: "speaking" });
  expect(audio.start).not.toHaveBeenCalled(); expect(Socket.instances).toHaveLength(0);
  expect(audio.play).toHaveBeenCalledOnce();
});
