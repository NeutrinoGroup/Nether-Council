import { afterEach, describe, expect, test, vi } from "vitest";
import { deriveWaveformState } from "../../apps/web/src/features/voice/DualChannelWaveform";
import { sampleDualChannelLevels, silentLevels, type AudioNodes } from "../../apps/web/src/features/voice/useAudioReactive";
import { subscribeAudioFrame } from "../../apps/web/src/features/voice/audio/frames";
import { AudioEngine } from "../../apps/web/src/features/voice/audio/engine";
import { VoiceClient, idleView, type VoiceView } from "../../apps/web/src/features/voice/client";

vi.mock("../../apps/web/src/features/voice/audio/module", () => ({ preloadAudioWorklet: async () => "fixture-worklet" }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function analyser(amplitude = 0, frequency = 0, fftSize = 256): NonNullable<AudioNodes["input"]> {
  return {
    fftSize,
    getByteTimeDomainData: vi.fn(buffer => {
      for (let i = 0; i < fftSize; i++) buffer[i] = 128 + (i % 2 ? amplitude : -amplitude);
    }),
    getByteFrequencyData: vi.fn(buffer => { buffer.fill(frequency, 0, fftSize / 2); }),
  };
}

describe("waveform state and priority", () => {
  test.each(["listening", "thinking", "speaking", "reconnecting", "ended"] as const)("represents %s", phase => {
    expect(deriveWaveformState({ ...idleView, phase }, 1000)).toBe(phase);
  });
  test.each(["idle", "error", "ended"] as const)("%s wins over stale mute, finalizing, and interruption", phase => {
    expect(deriveWaveformState({ ...idleView, phase, muted: true, finalizing: true, interruptedAt: 950 }, 1000)).toBe("ended");
  });
  test.each(["connecting", "permission"] as const)("%s displays connecting", phase => {
    expect(deriveWaveformState({ ...idleView, phase }, 1000)).toBe("reconnecting");
  });
  test("interruption includes timestamp zero, expires at 900 ms, and ignores future clocks", () => {
    const view = { ...idleView, phase: "listening" as const, interruptedAt: 0 };
    expect(deriveWaveformState(view, 0)).toBe("interrupted");
    expect(deriveWaveformState(view, 899)).toBe("interrupted");
    expect(deriveWaveformState(view, 900)).toBe("listening");
    expect(deriveWaveformState(view, -1)).toBe("listening");
  });
  test("active interruption wins over mute; mute wins over reconnect and thinking", () => {
    expect(deriveWaveformState({ ...idleView, phase: "speaking", muted: true, interruptedAt: 950 }, 1000)).toBe("interrupted");
    expect(deriveWaveformState({ ...idleView, phase: "reconnecting", muted: true }, 1000)).toBe("muted");
    expect(deriveWaveformState({ ...idleView, phase: "thinking", muted: true }, 1000)).toBe("muted");
    expect(deriveWaveformState({ ...idleView, phase: "speaking", finalizing: true }, 1000)).toBe("thinking");
    expect(deriveWaveformState({ ...idleView, phase: "reconnecting", finalizing: true }, 1000)).toBe("reconnecting");
  });
});

describe("dual-channel sampling", () => {
  test.each([
    [0, 0, "none"], [32, 0, "user"], [0, 32, "ai"], [32, 32, "both"],
  ] as const)("mic=%i playback=%i detects %s", (user, ai, expected) => {
    const result = sampleDualChannelLevels({ input: analyser(user), output: analyser(ai) }, silentLevels());
    expect(result.speakingChannel).toBe(expected);
    expect(result.user > 0).toBe(user > 0); expect(result.ai > 0).toBe(ai > 0);
  });
  test("different FFT sizes and spectra stay independent in shared scratch buffers", () => {
    const levels = silentLevels();
    sampleDualChannelLevels({ input: analyser(8, 255, 512), output: analyser(32, 64, 64) }, levels);
    expect(levels.user).toBeCloseTo(8 / 128 * 7 * 0.35);
    expect(levels.ai).toBeCloseTo(0.35);
    expect(levels.character).toBe(levels.ai);
    expect([...levels.userBins]).toEqual(Array(16).fill(expect.closeTo(0.35)));
    expect([...levels.aiBins]).toEqual(Array(16).fill(expect.closeTo(64 / 255 * 0.35)));
  });
  test("frequency bars preserve the location of spectral energy", () => {
    const input = analyser(32);
    input.getByteFrequencyData = buffer => { buffer.fill(0); buffer.fill(255, 64, 72); };
    const result = sampleDualChannelLevels({ input }, silentLevels());
    expect(result.userBins[8]).toBeCloseTo(0.35);
    expect(result.userBins.filter(value => value > 0)).toHaveLength(1);
  });
  test("missing nodes clamp envelopes and bars immediately without a smoothing tail", () => {
    const levels = silentLevels(), nodes = { input: analyser(32, 255), output: analyser(32, 255) };
    sampleDualChannelLevels(nodes, levels);
    sampleDualChannelLevels({ output: nodes.output }, levels);
    expect(levels.user).toBe(0); expect(levels.userBins.every(value => value === 0)).toBe(true);
    expect(levels.speakingChannel).toBe("ai");
    sampleDualChannelLevels({ input: nodes.input }, levels);
    expect(levels.ai).toBe(0); expect(levels.character).toBe(0); expect(levels.high).toBe(0);
    expect(levels.aiBins.every(value => value === 0)).toBe(true); expect(levels.speakingChannel).toBe("user");
    sampleDualChannelLevels({}, levels);
    expect(levels.user).toBe(0); expect(levels.speakingChannel).toBe("none");
  });
  test("envelopes smooth attack/release, remain normalized, and settle to silence", () => {
    const levels = silentLevels(), nodes = { input: analyser(127, 255), output: analyser(127, 255) }, buffers = {};
    for (let i = 0; i < 30; i++) sampleDualChannelLevels(nodes, levels, buffers);
    expect(levels.user).toBeGreaterThan(0.99); expect(levels.ai).toBeLessThanOrEqual(1);
    expect(levels.userBins.every(value => value >= 0 && value <= 1)).toBe(true);
    const previous = levels.user;
    const quiet = { input: analyser(), output: analyser() };
    sampleDualChannelLevels(quiet, levels, buffers);
    expect(levels.user).toBeCloseTo(previous * 0.85);
    for (let i = 0; i < 80; i++) sampleDualChannelLevels(quiet, levels, buffers);
    expect(levels.user).toBe(0); expect(levels.ai).toBe(0); expect(levels.speakingChannel).toBe("none");
  });
  test("reuses caller-owned result, bar arrays, and analyser scratch buffers across frames", () => {
    const levels = silentLevels(), userBins = levels.userBins, aiBins = levels.aiBins;
    const buffers = { time: new Uint8Array(512), freq: new Uint8Array(256) };
    const time = buffers.time, freq = buffers.freq, nodes = { input: analyser(8), output: analyser(32) };
    for (let i = 0; i < 60; i++) expect(sampleDualChannelLevels(nodes, levels, buffers)).toBe(levels);
    expect(levels.userBins).toBe(userBins); expect(levels.aiBins).toBe(aiBins);
    expect(buffers.time).toBe(time); expect(buffers.freq).toBe(freq);
    expect(nodes.input.getByteTimeDomainData).toHaveBeenLastCalledWith(time);
    expect(nodes.output.getByteFrequencyData).toHaveBeenLastCalledWith(freq);
  });
  test("reduced motion immediately flattens dynamic bars while retaining real activity", () => {
    const levels = silentLevels(), nodes = { input: analyser(32, 255), output: analyser(32, 255) }, buffers = {};
    sampleDualChannelLevels(nodes, levels, buffers);
    sampleDualChannelLevels(nodes, levels, buffers, true);
    expect(levels.userBins.every(value => value === 0)).toBe(true);
    expect(levels.aiBins.every(value => value === 0)).toBe(true);
    expect(levels.speakingChannel).toBe("both");
    sampleDualChannelLevels(nodes, levels, buffers, false);
    expect(levels.userBins[0]).toBeGreaterThan(0);
  });
});

test("sampling and both visual consumers share one RAF, pause hidden, and clean up", () => {
  const document = Object.assign(new EventTarget(), { hidden: false });
  const pending = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("document", document);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending.set(++id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => pending.delete(frame));
  const order: string[] = [];
  const stopWaveform = subscribeAudioFrame(() => order.push("waveform"));
  const stopAltar = subscribeAudioFrame(() => order.push("altar"));
  const stopSampling = subscribeAudioFrame(() => order.push("sample"), "sample");
  try {
    expect(pending.size).toBe(1);
    const advance = () => { const [frame, callback] = [...pending][0]; pending.delete(frame); callback(1000); };
    advance(); expect(order).toEqual(["sample", "waveform", "altar"]); expect(pending.size).toBe(1);
    document.hidden = true; document.dispatchEvent(new Event("visibilitychange"));
    expect(pending.size).toBe(0);
    document.hidden = false; document.dispatchEvent(new Event("visibilitychange"));
    expect(pending.size).toBe(1);
    stopWaveform(); stopAltar(); advance(); expect(order.at(-1)).toBe("sample");
  } finally { stopWaveform(); stopAltar(); stopSampling(); }
  expect(pending.size).toBe(0);
  document.dispatchEvent(new Event("visibilitychange")); expect(pending.size).toBe(0);
});

function engineFixture() {
  class Node {
    fftSize = 256; smoothingTimeConstant = 0; gain = { value: 0 };
    port = { postMessage: vi.fn(), onmessage: null };
    connect() { return this; } disconnect() {}
    getByteTimeDomainData(buffer: Uint8Array) { buffer.fill(160, 0, this.fftSize); }
    getByteFrequencyData(buffer: Uint8Array) { buffer.fill(255, 0, this.fftSize / 2); }
    getFloatTimeDomainData(buffer: Float32Array) { buffer.fill(0.25); }
  }
  class Context {
    state = "running"; destination = {}; audioWorklet = { addModule: async () => {} };
    async resume() {} async close() {}
    createAnalyser() { return new Node(); } createGain() { return new Node(); }
    createMediaStreamSource() { return new Node(); }
  }
  const track = { enabled: true, stop() {}, getSettings: () => ({}) };
  vi.stubGlobal("AudioContext", Context); vi.stubGlobal("AudioWorkletNode", Node);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } });
  return new AudioEngine();
}

test("engine mute, clear, stopCapture, and stop expose no stale channel activity", async () => {
  const engine = engineFixture(), levels = silentLevels(), buffers = {};
  try {
    await engine.start(() => {}); engine.play("AAA=");
    const nodes = engine.analysers();
    sampleDualChannelLevels(nodes, levels, buffers); expect(levels.speakingChannel).toBe("both");
    engine.mute(true); sampleDualChannelLevels(engine.analysers(), levels, buffers);
    expect(levels.user).toBe(0); expect(levels.speakingChannel).toBe("ai");
    engine.mute(false); engine.clear(); sampleDualChannelLevels(engine.analysers(), levels, buffers);
    expect(levels.ai).toBe(0); expect(levels.speakingChannel).toBe("user");
    expect(engine.analysers()).toBe(nodes);
    engine.stopCapture(); sampleDualChannelLevels(engine.analysers(), levels, buffers);
    expect(levels.speakingChannel).toBe("none");
    engine.play("AAA="); engine.stop(); sampleDualChannelLevels(engine.analysers(), levels, buffers);
    expect(levels.speakingChannel).toBe("none");
  } finally { engine.stop(); }
});

class Socket {
  static OPEN = 1; static instances: Socket[] = [];
  readyState = 1; bufferedAmount = 0;
  onopen?: () => void; onmessage?: (event: { data: string }) => void; onclose?: (event: { code: number }) => void;
  constructor() { Socket.instances.push(this); }
  send() {} close() { this.readyState = 3; }
}

test.each(["interrupt", "speech.started"])("%s drops AI immediately and real turn events drive thinking/speaking", async trigger => {
  vi.useFakeTimers(); Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("location", { protocol: "https:", host: "fixture.test" });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem() {} }); vi.stubGlobal("localStorage", undefined);
  const now = Date.now();
  const session = { id: "11111111-1111-4111-8111-111111111111", characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ session }) })));
  const engine = engineFixture(); let view: VoiceView = idleView, seq = 0;
  const client = new VoiceClient(value => { view = value; }, { engine });
  try {
    await client.start("en", "fixture");
    const socket = Socket.instances[0]; socket.onopen?.();
    const send = (event: object) => socket.onmessage?.({ data: JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: session.id, epoch: 0, seq: seq++, ...event }) });
    send({ type: "session.ready", session });
    send({ type: "speech.stopped" }); expect(view.phase).toBe("thinking");
    send({ type: "response.started", responseId: "a" });
    send({ type: "audio.delta", responseId: "a", audio: "AAA=" }); expect(view.phase).toBe("speaking");
    const levels = silentLevels(); sampleDualChannelLevels(client.analysers(), levels);
    expect(levels.ai).toBeGreaterThan(0);
    if (trigger === "interrupt") client.interrupt(); else send({ type: "speech.started" });
    sampleDualChannelLevels(client.analysers(), levels);
    expect(levels.ai).toBe(0); expect(levels.aiBins.every(value => value === 0)).toBe(true);
    expect(deriveWaveformState(view)).toBe("interrupted");
    send({ type: "audio.delta", responseId: "a", audio: "AAA=" }); expect(engine.isPlaying()).toBe(false);
    send({ type: "response.started", responseId: "b" }); expect(view.phase).toBe("thinking");
    send({ type: "audio.delta", responseId: "b", audio: "AAA=" }); expect(deriveWaveformState(view)).toBe("speaking");
    engine.clear(); client.analysers(); expect(view.phase).toBe("listening");
    send({ type: "response.started", responseId: "text-only" }); expect(view.phase).toBe("thinking");
    send({ type: "response.done", responseId: "text-only" }); expect(view.phase).toBe("listening");
  } finally { client.stop(); }
});
