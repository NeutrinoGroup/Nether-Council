import { afterEach, expect, test, vi } from "vitest";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AddressInfo } from "node:net";
import WebSocket, { WebSocketServer } from "ws";
import { CharacterId, ServerMessage, type Session } from "@nether/contracts";
import { PcmResampler, PcmFrameBuffer, pcm16le, encodePcmBase64, decodePcm16Base64ToFloat32 } from "@nether/party-core";
import { getVadConfig, relayVoice } from "../../apps/web/src/features/voice/server/relay";
import { AudioEngine } from "../../apps/web/src/features/voice/audio/engine";
import { compareVoiceLatencyProfiles } from "../../scripts/benchmark-voice-latency";

vi.mock("../../apps/web/src/features/voice/audio/module", () => ({ preloadAudioWorklet: async () => "fixture-worklet" }));
const servers: WebSocketServer[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const server of servers.splice(0)) {
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

// Frozen legacy box-filter oracle, including its fractional carry and rounding.
function referenceResampler(sourceRate: number) {
  const ratio = sourceRate / 16000;
  let area = 0, filled = 0;
  return (input: Float32Array) => {
    const output: number[] = [];
    for (const sample of input) {
      let remaining = 1;
      while (remaining > 1e-8) {
        const take = Math.min(remaining, ratio - filled);
        area += (Number.isFinite(sample) ? sample : 0) * take;
        filled += take; remaining -= take;
        if (filled >= ratio - 1e-8) {
          const value = Math.max(-1, Math.min(1, area / ratio));
          output.push(Math.round(value * (value < 0 ? 32768 : 32767)));
          area = filled = 0;
        }
      }
    }
    return Int16Array.from(output);
  };
}

test.each([8000, 16000, 44100, 48000, 96000])("%i Hz resampling is bit-exact with zero dropped samples across 128-sample quantums", rate => {
  const source = Float32Array.from({ length: 128 * 180 }, (_, i) => Math.sin(i * 0.071) * 1.15);
  source[127] = NaN; source[256] = Infinity;
  const resampler = new PcmResampler(rate), reference = referenceResampler(rate), frames = new PcmFrameBuffer(400);
  const expected: number[] = [], actual: number[] = [];
  const append = (buffer: ArrayBuffer) => {
    const view = new DataView(buffer);
    for (let i = 0; i < buffer.byteLength; i += 2) actual.push(view.getInt16(i, true));
  };
  expect(resampler.push(new Float32Array())).toHaveLength(0);
  for (let offset = 0; offset < source.length; offset += 128) {
    const input = source.subarray(offset, offset + 128), samples = resampler.push(input);
    const oracle = reference(input);
    expect(samples).toEqual(oracle);
    expected.push(...oracle);
    frames.push(samples);
    let frame: ArrayBuffer | null;
    while ((frame = frames.readFrame()) !== null) { expect(frame.byteLength).toBe(640); append(frame); }
  }
  expect(actual.length).toBe(Math.floor(expected.length / 320) * 320);
  if (expected.length % 320) append(frames.readFrame(expected.length % 320)!);
  expect(actual).toEqual(expected);
  expect(frames.readFrame(1)).toBeNull();
  expect([...new PcmResampler(rate).push(source)]).toEqual(expected);
});

test("capture ring preserves wrapped samples while growing and validates frame sizes", () => {
  const frames = new PcmFrameBuffer(6);
  frames.push(Int16Array.of(1, 2, 3, 4, 5));
  expect(frames.readFrame(4)).toEqual(pcm16le(Int16Array.of(1, 2, 3, 4)));
  frames.push(Int16Array.of(6, 7, 8, 9));
  frames.push(Int16Array.of(10, 11, 12, 13, 14));
  expect(frames.readFrame(10)).toEqual(pcm16le(Int16Array.of(5, 6, 7, 8, 9, 10, 11, 12, 13, 14)));
  expect(frames.readFrame()).toBeNull();
  expect(() => frames.readFrame(0)).toThrow();
  expect(() => new PcmFrameBuffer(0)).toThrow();
});

test.each([false, true])("base64 codec covers all signed PCM16 values, chunk boundaries and odd-byte rejection (Buffer fallback=%s)", fallback => {
  if (fallback) { vi.stubGlobal("btoa", undefined); vi.stubGlobal("atob", undefined); }
  const samples = Int16Array.from({ length: 65536 }, (_, i) => i - 32768);
  const bytes = new Uint8Array(pcm16le(samples));
  const encoded = encodePcmBase64(bytes);
  expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
  const decoded = decodePcm16Base64ToFloat32(encoded);
  expect(decoded).toEqual(Float32Array.from(samples, value => value / 32768));
  for (const length of [0, 2, 640, 4094, 4096, 4098, 8194]) {
    expect(decodePcm16Base64ToFloat32(encodePcmBase64(bytes.subarray(0, length)))).toEqual(decoded.subarray(0, length / 2));
  }
  expect(() => decodePcm16Base64ToFloat32(encodePcmBase64(Uint8Array.of(1, 2, 3)))).toThrow("Invalid PCM16");
});

test("local barge-in requires two consecutive frames above RMS 0.038 and rearms after silence", async () => {
  const nodes: FakeNode[] = [];
  class FakeNode {
    port = { onmessage: undefined as ((event: { data: ArrayBuffer }) => void) | undefined, postMessage: vi.fn() };
    gain = { value: 0 }; fftSize = 256;
    constructor(_context?: unknown, readonly name?: string) { nodes.push(this); }
    connect() { return this; } disconnect() {}
  }
  class FakeContext {
    state = "running"; destination = {};
    audioWorklet = { addModule: async () => {} };
    async resume() {} async close() {}
    createAnalyser() { return new FakeNode(); } createGain() { return new FakeNode(); }
    createMediaStreamSource() { return new FakeNode(); }
  }
  const track = { stop: vi.fn(), enabled: true };
  vi.stubGlobal("AudioContext", FakeContext); vi.stubGlobal("AudioWorkletNode", FakeNode);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } });
  const engine = new AudioEngine(), speech = vi.fn(), pcm = vi.fn();
  try {
    await engine.start(pcm, speech);
    const capture = nodes.find(node => node.name === "nether-capture")!;
    const frame = (amplitude: number) => capture.port.onmessage!({ data: pcm16le(new Int16Array(320).fill(Math.round(amplitude * 32768))) });
    frame(0.04); frame(0); frame(0.04);
    expect(speech).not.toHaveBeenCalled();
    frame(0.04); expect(speech).toHaveBeenCalledTimes(1);
    frame(0.04); expect(speech).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) frame(0);
    frame(0.037); frame(0.037); expect(speech).toHaveBeenCalledTimes(1);
    frame(0.04); frame(0.04); expect(speech).toHaveBeenCalledTimes(2);
    engine.mute(true); frame(0.04); frame(0.04); expect(speech).toHaveBeenCalledTimes(2);
    expect(pcm.mock.calls[0][0]).toBe(encodePcmBase64(new Uint8Array(pcm16le(new Int16Array(320).fill(1311)))));
  } finally { engine.stop(); }
});

test("balanced VAD is configured for every character in both locales", () => {
  for (const character of CharacterId.options) for (const locale of ["zh", "en"] as const) {
    expect(getVadConfig(character, locale)).toEqual({ type: "server_vad", threshold: 0.5, prefix_padding_ms: character === "meng-po" ? 240 : 200, silence_duration_ms: character === "meng-po" ? 520 : 340 });
  }
});

const waitFor = async (condition: () => boolean) => {
  const deadline = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Duplex fixture timed out");
    await new Promise(resolve => setTimeout(resolve, 2));
  }
};
async function fixture(characterId: Session["characterId"] = "meng-po", gateway = false) {
  async function server() {
    const value = new WebSocketServer({ host: "127.0.0.1", port: 0 }); servers.push(value);
    await once(value, "listening"); return value;
  }
  const provider = await server(), edge = await server();
  const url = (server: WebSocketServer) => `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const now = Date.now();
  const session: Session = { id: crypto.randomUUID(), characterId, locale: "en", mode: "personal", createdAt: now, captureUntil: now + 60000, expiresAt: now + 120000 };
  const requests: { type: string; session?: { instructions?: string; turn_detection?: unknown }; item?: { type?: string; call_id?: string } }[] = [];
  let remote: WebSocket | undefined, finished: Promise<void> | undefined, seq = 0;
  provider.on("connection", socket => {
    remote = socket;
    socket.on("message", data => {
      const event = JSON.parse(String(data)); requests.push(event);
      if (event.type === "session.update") socket.send(JSON.stringify({ type: "session.updated" }));
    });
    socket.send(JSON.stringify({ type: "session.created" }));
  });
  edge.on("connection", socket => { finished = relayVoice(socket, session, { realtimeKey: "fixture", realtimeUrl: url(provider), realtimeModel: "fixture", ...(gateway ? { gatewayUrl: url(provider), gatewaySecret: "fixture" } : {}) }); });
  const client = new WebSocket(url(edge)), received: ServerMessage[] = [];
  client.on("message", data => received.push(ServerMessage.parse(JSON.parse(String(data)))));
  await once(client, "open");
  const send = (event: object) => client.send(JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: session.id, epoch: 0, seq: seq++, ...event }));
  send({ type: "session.start" });
  await waitFor(() => received.some(event => event.type === "session.ready") && requests.some(event => event.type === "response.create"));
  return {
    requests, received, send,
    emit: (event: object) => remote!.send(JSON.stringify(event)),
    count: (type: string) => requests.filter(event => event.type === type).length,
    close: async () => { client.close(); await finished; },
  };
}

test.each(["meng-po", "hei-wuchang"] as const)("%s skips unchanged instruction updates on tool continuations", async character => {
  const f = await fixture(character);
  try {
    expect(f.requests[0].session?.turn_detection).toEqual(getVadConfig(character, "en"));
    for (let i = 0; i < 2; i++) {
      f.emit({ type: "response.created", response: { id: `tool-${i}` } });
      f.emit({ type: "response.function_call_arguments.done", response_id: `tool-${i}`, call_id: `call-${i}`, name: "change_mood", arguments: JSON.stringify({ mood: character === "meng-po" ? "healing" : "warm" }) });
      f.emit({ type: "response.done", response: { id: `tool-${i}`, status: "completed" } });
      await waitFor(() => f.count("response.create") === i + 2);
      expect(f.count("session.update")).toBe(1);
    }
  } finally { await f.close(); }
});

test("Meng Po synchronizes changed user counts and ritual completion exactly once", async () => {
  const f = await fixture();
  try {
    for (let i = 1; i <= 3; i++) {
      const event = { type: "conversation.item.input_audio_transcription.completed", item_id: `user-${i}`, transcript: "My meetings run past midnight." };
      f.emit(event); f.emit(event);
      await waitFor(() => f.count("session.update") === i + 1);
    }
    const before = f.count("response.create");
    f.emit({ type: "response.created", response: { id: "ritual" } });
    f.emit({ type: "response.function_call_arguments.done", response_id: "ritual", call_id: "ritual-call", name: "trigger_soul_soup_ritual", arguments: JSON.stringify({ blessing_quote: "Sleep well tonight" }) });
    f.emit({ type: "response.done", response: { id: "ritual", status: "completed" } });
    await waitFor(() => f.count("response.create") === before + 1);
    expect(f.count("session.update")).toBe(5);
    const instructions = f.requests.filter(event => event.type === "session.update").map(event => event.session!.instructions!);
    expect(new Set(instructions).size).toBe(5);
    expect(instructions[3]).toContain("至少3次"); expect(instructions[4]).toContain("仪式已完成");
    f.emit({ type: "response.created", response: { id: "after" } });
    f.emit({ type: "response.function_call_arguments.done", response_id: "after", call_id: "repeat-ritual", name: "trigger_soul_soup_ritual", arguments: JSON.stringify({ blessing_quote: "Sleep well tonight" }) });
    f.emit({ type: "response.done", response: { id: "after", status: "completed" } });
    await waitFor(() => f.count("response.create") === before + 2);
    expect(f.count("session.update")).toBe(5);
    expect(f.received.filter(event => event.type === "soul.action")).toHaveLength(1);
  } finally { await f.close(); }
});

test.each([["meng-po", false], ["hei-wuchang", false], ["meng-po", true], ["hei-wuchang", true]] as const)("%s gateway=%s drops all stale response-scoped events", async (character, gateway) => {
  const f = await fixture(character, gateway);
  try {
    f.emit({ type: "response.created", response: { id: "old" } });
    f.emit({ type: "response.audio.delta", response_id: "old", delta: "AAA=" });
    await waitFor(() => f.received.some(event => event.type === "audio.delta"));
    f.send({ type: "response.cancel", responseId: "old" });
    await waitFor(() => f.count("response.cancel") === 1);
    f.emit({ type: "response.created", response: { id: "current" } });
    const before = f.count("conversation.item.create");
    for (const rid of ["old", "foreign"]) {
      f.emit({ type: "response.audio.delta", response_id: rid, delta: "AQ==" }); // malformed PCM must be dropped before decoding
      f.emit({ type: "response.audio_transcript.delta", response_id: rid, delta: "Stale words" });
      f.emit({ type: "response.function_call_arguments.done", response_id: rid, call_id: rid, name: "change_mood", arguments: '{"mood":"healing"}' });
      f.emit({ type: "UI_ACTION", response_id: rid, call_id: rid, payload: { action: "change_mood", data: { mood: "warm" } } });
      f.emit({ type: "gateway.tool_result", response_id: rid, call_id: rid });
      f.emit({ type: "UI_ACTION", response_id: rid, call_id: rid, payload: { action: "invalid-stale-payload" } });
    }
    f.emit({ type: "response.audio.delta", response_id: "current", delta: "AAA=" });
    f.emit({ type: "response.audio_transcript.delta", response_id: "current", delta: "Fresh words" });
    f.emit({ type: "response.done", response: { id: "current", status: "completed" } });
    await waitFor(() => f.received.some(event => event.type === "response.done" && event.responseId === "current"));
    expect(f.received.filter(event => event.type === "audio.delta")).toHaveLength(2);
    expect(f.received.filter(event => ["UI_ACTION", "soul.action", "error"].includes(event.type))).toHaveLength(0);
    expect(f.received.filter(event => event.type === "caption").every(event => event.type === "caption" && event.caption.sourceText === "Fresh words")).toBe(true);
    expect(f.count("conversation.item.create")).toBe(before);
    expect(f.count("response.create")).toBe(1);
  } finally { await f.close(); }
});

test("Python gateway consumes canceled PCM and captions for scene and Meng Po sessions", async () => {
  const { stdout } = await promisify(execFile)("uv", ["run", "--project", "services/voice", "--frozen", "pytest", "services/voice/tests/test_duplex_performance.py", "-q"], { timeout: 30000 });
  expect(stdout).toContain("passed");
}, 35000);

test("profile comparison reduces modeled P95 by at least 20% and barge-in by 20ms", async () => {
  const result = await compareVoiceLatencyProfiles();
  expect(result.passed).toBe(true);
  expect(result.p95Reduction).toBeGreaterThanOrEqual(0.2);
  expect(result.bargeInImprovementMs).toBe(20);
  expect(result.baseline.modeled!.redundantInstructionUpdates).toBe(1);
  expect(result.optimized.modeled!.redundantInstructionUpdates).toBe(0);
  expect(result.optimized.modeled!.turns).toHaveLength(35);
  expect(result.optimized.modeled!.turns.every(turn => turn.vadSilenceMs === (turn.characterId === "meng-po" ? 520 : 340))).toBe(true);
}, 20000);
