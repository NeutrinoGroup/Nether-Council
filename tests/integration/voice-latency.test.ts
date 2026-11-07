import { afterEach, describe, expect, test, vi } from "vitest";
import { ServerMessage, ServerTurnTiming, type Session } from "@nether/contracts";
import { computePercentileStats, evaluateTurnSample, summarizeLatencySamples } from "@nether/party-core";
import { VoiceClient, idleView, type VoiceEngine } from "../../apps/web/src/features/voice/client";
import { AudioEngine } from "../../apps/web/src/features/voice/audio/engine";
import { runVoiceLatencyBenchmark } from "../../scripts/benchmark-voice-latency";

const sample = (turnIndex: number, ms: number) => evaluateTurnSample({ turnIndex, responseId: `r${turnIndex}`, mode: "simulated", serverTurnToFirstAudioMs: ms, clientTurnToFirstAudioMs: ms + 20, queueBacklogMs: 10 });

test("percentiles interpolate ranks, retain zeros and ignore invalid observations without mutating input", () => {
  const values = [40, 10, 30, 20];
  expect(computePercentileStats(values)).toEqual({ count: 4, min: 10, p50: 25, p95: 38.5, max: 40, mean: 25 });
  expect(values).toEqual([40, 10, 30, 20]);
  expect(computePercentileStats([])).toBeUndefined();
  expect(computePercentileStats([NaN, Infinity, -1])).toBeUndefined();
  expect(computePercentileStats([0, NaN, -1])).toEqual({ count: 1, min: 0, p50: 0, p95: 0, max: 0, mean: 0 });
  expect(computePercentileStats([7, 7, 7])?.p95).toBe(7);
});

test("derived latency uses relative durations and missing values remain unmeasured", () => {
  expect(sample(0, 100)).toMatchObject({ networkAndRelayEstimateMs: 20, endToEndPlaybackMs: 130, anomalous: false });
  const shorterClient = evaluateTurnSample({ turnIndex: 1, responseId: "vad-delivery", mode: "provider", clientTurnToFirstAudioMs: 80, serverTurnToFirstAudioMs: 100 });
  expect(shorterClient).toMatchObject({ networkAndRelayEstimateMs: 0, endToEndPlaybackMs: 80 });
  const greeting = evaluateTurnSample({ turnIndex: 0, responseId: "greeting", mode: "provider", handshakeMs: 42 });
  expect(greeting.endToEndPlaybackMs).toBeUndefined();
  expect(greeting.networkAndRelayEstimateMs).toBeUndefined();
  const invalid = evaluateTurnSample({ turnIndex: 1, responseId: "bad", mode: "simulated", queueBacklogMs: NaN, clientTurnToFirstAudioMs: -1, bargeInStopMs: 151, serverTurnToResponseMs: 300, serverTurnToFirstAudioMs: 200 });
  expect(invalid).toMatchObject({ anomalous: true, anomalyReasons: ["invalid:clientTurnToFirstAudioMs", "invalid:queueBacklogMs", "out_of_order:serverTurnToFirstAudioMs", "slow:bargeInStopMs"] });
  expect(invalid.endToEndPlaybackMs).toBeUndefined();
});

test("summaries separate evidence modes, count failures and select a component bottleneck", () => {
  const samples = [sample(1, 100), sample(2, 200), evaluateTurnSample({ turnIndex: 3, responseId: "live", mode: "provider", clientTurnToFirstAudioMs: 9999 })];
  const summary = summarizeLatencySamples(samples, { failedTurns: 1 });
  expect(summary).toMatchObject({ mode: "simulated", totalTurns: 3, failedTurns: 1, failureRate: 1 / 3, anomalousTurns: 0, bottleneckStage: "serverTurnToFirstAudioMs" });
  expect(summary.stages.endToEndPlaybackMs).toMatchObject({ count: 2, p50: 180, p95: 225 });
  expect(summarizeLatencySamples(samples, { mode: "provider" })).toMatchObject({ totalTurns: 1, anomalousTurns: 1 });
  expect(summarizeLatencySamples([], { failedTurns: -1 })).toEqual({ mode: "simulated", totalTurns: 0, failedTurns: 0, failureRate: 0, anomalousTurns: 0, stages: {}, bottleneckStage: "unavailable" });
  expect(summarizeLatencySamples([], { mode: "acoustic", failedTurns: 2 })).toMatchObject({ mode: "acoustic", totalTurns: 2, failureRate: 1 });
  expect(summarizeLatencySamples([evaluateTurnSample({ turnIndex: 0, responseId: "queue", mode: "provider", serverTurnToFirstAudioMs: 100, queueBacklogMs: 800 })]).bottleneckStage).toBe("queueBacklogMs");
});

test("timing contracts are optional, strict and nonnegative integer durations", () => {
  expect(ServerTurnTiming.parse({ handshakeMs: 0, toolContinuationMs: 20 })).toEqual({ handshakeMs: 0, toolContinuationMs: 20 });
  for (const timing of [{ handshakeMs: -1 }, { vadSpeechMs: 0.5 }, { toolContinuationMs: Infinity }, { timestamp: 123 }]) expect(ServerTurnTiming.safeParse(timing).success).toBe(false);
  const now = Date.now();
  const session: Session = { id: "11111111-1111-4111-8111-111111111111", characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  const envelope = { protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: session.id, epoch: 0, seq: 0 };
  for (const payload of [{ type: "session.ready", session }, { type: "response.started", responseId: "r" }, { type: "audio.delta", responseId: "r", audio: "AAA=" }, { type: "response.done", responseId: "r" }]) {
    expect(ServerMessage.safeParse({ ...envelope, ...payload }).success).toBe(true);
    expect(ServerMessage.safeParse({ ...envelope, ...payload, timing: { handshakeMs: 12 } }).success).toBe(true);
    expect(ServerMessage.safeParse({ ...envelope, ...payload, timing: { unknown: 12 } }).success).toBe(false);
  }
});

test("relay emits per-turn timing once per first audio through deterministic multi-turn client benchmark", async () => {
  const report = await runVoiceLatencyBenchmark();
  expect(await runVoiceLatencyBenchmark()).toEqual(report);
  expect(report.summary).toMatchObject({ mode: "simulated", totalTurns: 7, failedTurns: 0, failureRate: 0, anomalousTurns: 0 });
  expect(report.summary.stages.endToEndPlaybackMs).toMatchObject({ count: 6, p50: 152.5, p95: 235.75 });
  expect(report.summary.stages.bargeInStopMs).toMatchObject({ count: 2, p50: 2, p95: 2 });
  expect(report.timingEvents.find(event => event.type === "session.ready")?.timing).toEqual({ handshakeMs: 60 });
  expect(report.timingEvents.find(event => event.type === "response.started" && event.responseId === "turn-1")?.timing).toEqual({ vadSpeechMs: 322, serverTurnToResponseMs: 70 });
  expect(report.timingEvents.find(event => event.type === "response.started" && event.responseId === "turn-2")?.timing).toEqual({ serverTurnToResponseMs: 80 });
  expect(report.timingEvents.filter(event => event.type === "audio.delta" && event.responseId === "turn-1")).toHaveLength(1);
  expect(report.timingEvents.find(event => event.type === "audio.delta" && event.responseId === "tool-continuation")?.timing).toMatchObject({ toolContinuationMs: 75 });
  expect(report.samples[0].clientTurnToFirstAudioMs).toBeUndefined();
  expect(report.samples.find(item => item.responseId === "turn-4")?.bargeInStopMs).toBe(2);
  expect(report.samples.find(item => item.responseId === "turn-5")?.toolContinuationMs).toBeUndefined();
  expect(JSON.stringify(report)).not.toMatch(/Authorization|fixture turn|input_text|11111111|audio\":|sessionId|realtimeKey/);
}, 15000);

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1; bufferedAmount = 0;
  sent: Record<string, unknown>[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  constructor() { Socket.instances.push(this); }
  send(text: string) { this.sent.push(JSON.parse(text)); }
  close() { this.readyState = 3; }
}
let client: VoiceClient | undefined;
afterEach(() => { client?.stop(); client = undefined; vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function clientFixture(withQueue = true) {
  vi.useFakeTimers();
  let clock = 1000, queue = 0, view = idleView, seq = 0;
  let socket: Socket;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("location", { protocol: "https:", host: "fixture.test" });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem() {} });
  vi.stubGlobal("localStorage", undefined);
  const now = Date.now();
  const session: Session = { id: "11111111-1111-4111-8111-111111111111", characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ session }) })));
  const engine: VoiceEngine = {
    async start() {}, async prepareOutput() {}, play: vi.fn(() => { queue += 10; clock += 2; }),
    clear: () => { queue = 0; clock += 3; return 3; }, stop: () => 0, stopCapture() {}, mute() {},
    rms: () => 0, isPlaying: () => queue > 0, analysers: () => ({ input: undefined, output: undefined }), settings: () => undefined,
    ...(withQueue ? { queuedMs: () => queue } : {}),
  };
  client = new VoiceClient(value => { view = value; }, { engine });
  await client.start("en", "fixture");
  socket = Socket.instances[0]; socket.onopen?.();
  const send = (event: object, epoch = 0) => socket.onmessage?.({ data: JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: session.id, epoch, seq: seq++, ...event }) });
  send({ type: "session.ready", session, timing: { handshakeMs: 40 } });
  return { client, engine, session, send, view: () => view, socket: () => socket, setQueue: (ms: number) => { queue = ms; }, advance: (ms: number) => { clock += ms; }, reconnect: () => { socket = Socket.instances.at(-1)!; socket.onopen?.(); seq = 0; } };
}

describe("VoiceClient latency observatory", () => {
  test("records text turn and first audio, keeps queue before enqueue, then adds stop duration", async () => {
    const f = await clientFixture();
    f.client.submitText("fixture");
    f.advance(100); f.send({ type: "response.started", responseId: "r1", timing: { serverTurnToResponseMs: 80 } });
    f.setQueue(30);
    f.advance(60); f.send({ type: "audio.delta", responseId: "r1", audio: "AAA=", timing: { serverTurnToFirstAudioMs: 120 } });
    const first = f.view().latencySamples[0];
    expect(first).toMatchObject({ mode: "provider", handshakeMs: 40, clientTurnToResponseMs: 100, clientTurnToFirstAudioMs: 160, networkAndRelayEstimateMs: 40, queueBacklogMs: 30, playbackStartDelayMs: 32, endToEndPlaybackMs: 190 });
    f.advance(400); f.send({ type: "audio.delta", responseId: "r1", audio: "AAA=", timing: { serverTurnToFirstAudioMs: 999 } });
    expect(f.view().latencySamples).toEqual([first]);
    const firstAudioMs = f.view().firstAudioMs;
    f.client.interrupt();
    expect(f.view().latencySamples[0].bargeInStopMs).toBe(3);
    expect(f.view().latencySummary).toMatchObject({ totalTurns: 1, failedTurns: 0, stages: { bargeInStopMs: { count: 1, p95: 3 } } });
    f.send({ type: "audio.delta", responseId: "r1", audio: "AAA=" });
    f.send({ type: "response.started", responseId: "r1" });
    f.send({ type: "response.done", responseId: "r1", timing: { toolContinuationMs: 999 } });
    expect(f.engine.play).toHaveBeenCalledTimes(2);
    expect(f.view().latencySamples).toHaveLength(1);
    expect(f.view().firstAudioMs).toBe(firstAudioMs);
    expect(f.view().latencySamples[0].toolContinuationMs).toBeUndefined();
  });

  test("speech-stop and zero origin durations work with an engine without queuedMs", async () => {
    const f = await clientFixture(false);
    f.send({ type: "speech.started" }); f.send({ type: "speech.stopped" });
    f.send({ type: "response.started", responseId: "zero", timing: { vadSpeechMs: 300, serverTurnToResponseMs: 0 } });
    f.send({ type: "audio.delta", responseId: "zero", audio: "AAA=", timing: { serverTurnToFirstAudioMs: 0 } });
    expect(f.view().latencySamples[0]).toMatchObject({ clientTurnToFirstAudioMs: 0, clientTurnToResponseMs: 0, endToEndPlaybackMs: 0, networkAndRelayEstimateMs: 0 });
    expect(f.view().latencySamples[0].queueBacklogMs).toBeUndefined();
    f.send({ type: "speech.started" });
    expect(f.view().latencySamples[0].bargeInStopMs).toBe(3);
  });

  test("bounds samples to the newest 32 responses and recomputes summary", async () => {
    const f = await clientFixture();
    for (let i = 0; i < 35; i++) {
      f.client.submitText(`turn ${i}`);
      f.advance(10); f.send({ type: "response.started", responseId: `r${i}` });
      f.advance(20); f.send({ type: "audio.delta", responseId: `r${i}`, audio: "AAA=" });
      f.send({ type: "response.done", responseId: `r${i}` });
      f.setQueue(0); f.client.measurePlayback();
    }
    expect(f.view().latencySamples).toHaveLength(32);
    expect(f.view().latencySamples[0]).toMatchObject({ turnIndex: 3, responseId: "r3" });
    expect(f.view().latencySummary).toMatchObject({ totalTurns: 32, stages: { endToEndPlaybackMs: { count: 32, p50: 30 } } });
  });

  test("audio without a response-start event leaves that stage unmeasured", async () => {
    const f = await clientFixture();
    f.client.submitText("fixture");
    f.advance(90); f.send({ type: "audio.delta", responseId: "audio-only", audio: "AAA=" });
    expect(f.view().latencySamples[0].clientTurnToFirstAudioMs).toBe(90);
    expect(f.view().latencySamples[0].clientTurnToResponseMs).toBeUndefined();
  });

  test("a missing first audio counts once as failure, and reconnect greetings have no stale turn clock", async () => {
    const f = await clientFixture();
    f.client.submitText("fixture");
    f.send({ type: "response.started", responseId: "failed" });
    f.socket().onclose?.({ code: 1011 });
    await vi.advanceTimersByTimeAsync(1500); f.reconnect();
    f.send({ type: "session.ready", session: f.session, timing: { handshakeMs: 50 } }, 1);
    f.advance(300); f.send({ type: "response.started", responseId: "greeting" }, 1);
    f.send({ type: "audio.delta", responseId: "greeting", audio: "AAA=" }, 1);
    expect(f.view().latencySamples[0]).toMatchObject({ responseId: "greeting", handshakeMs: 50 });
    expect(f.view().latencySamples[0].clientTurnToFirstAudioMs).toBeUndefined();
    expect(f.view().latencySummary).toMatchObject({ totalTurns: 2, failedTurns: 1, failureRate: 0.5 });
  });

  test("a playback failure is not recorded as a successful first audio", async () => {
    const f = await clientFixture();
    f.client.submitText("fixture");
    f.send({ type: "response.started", responseId: "broken" });
    vi.mocked(f.engine.play).mockImplementationOnce(() => { throw new Error("PLAYBACK_BACKLOG"); });
    f.send({ type: "audio.delta", responseId: "broken", audio: "AAA=" });
    expect(f.view()).toMatchObject({ phase: "error", latencySamples: [], latencySummary: { totalTurns: 1, failedTurns: 1, failureRate: 1 } });
  });
});

test("AudioWorklet queue duration follows submitted PCM and clears synchronously", async () => {
  const messages: { type: string; generation: number }[] = [];
  class Worklet {
    port = { postMessage: (message: { type: string; generation: number }) => messages.push(message), onmessage: undefined };
    connect() { return { connect() {} }; }
    disconnect() {}
  }
  class Context {
    state = "running";
    audioWorklet = { async addModule() {} };
    destination = {};
    async resume() {}
    async close() {}
    createAnalyser() { return { fftSize: 0, disconnect() {} }; }
  }
  vi.stubGlobal("AudioContext", Context); vi.stubGlobal("AudioWorkletNode", Worklet);
  vi.stubGlobal("fetch", async () => ({ ok: true, text: async () => "" }));
  const engine = new AudioEngine();
  await engine.prepareOutput();
  engine.play(Buffer.alloc(2400 * 2).toString("base64"));
  expect(engine.queuedMs()).toBe(100);
  expect(engine.clear()).toBeGreaterThanOrEqual(0);
  expect(engine.queuedMs()).toBe(0);
  expect(messages.at(-1)).toMatchObject({ type: "clear", generation: 1 });
  expect(engine.stop()).toBeGreaterThanOrEqual(0);
  expect(engine.stop()).toBe(0);
});
