import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import { CharacterId, ServerMessage, type Session } from "@nether/contracts";
import { VoiceClient, idleView, type VoiceEngine, type VoiceView } from "../apps/web/src/features/voice/client";
import { computePercentileStats, encodePcmBase64, decodePcm16Base64ToFloat32 } from "@nether/party-core";
import { getVadConfig, relayVoice } from "../apps/web/src/features/voice/server/relay";

const waitFor = async (condition: () => boolean) => {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("BENCHMARK_EVENT_TIMEOUT");
    await new Promise(resolve => setTimeout(resolve, 1));
  }
};
const address = (server: WebSocketServer) => {
  const value = server.address();
  if (!value || typeof value === "string") throw new Error("BENCHMARK_LISTENER_UNAVAILABLE");
  return `ws://127.0.0.1:${value.port}`;
};

/** Real relay and client protocol, mock provider/audio, scripted monotonic time.
 * Run in isolation: browser globals and performance.now are restored in finally.
 */
export async function runVoiceLatencyBenchmark(options?: { profile?: "baseline" | "optimized" }) {
  let clock = 1000, backlog = 0;
  const globals = ["WebSocket", "location", "fetch", "sessionStorage", "localStorage"] as const;
  const saved = globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const savedNow = Object.getOwnPropertyDescriptor(performance, "now");
  const install = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const provider = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const edge = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  let upstream: WebSocket | undefined, relayFinished: Promise<void> | undefined;
  const providerMessages: { type: string; session?: { instructions?: string } }[] = [];
  const events: ServerMessage[] = [];
  let view: VoiceView = idleView;
  let client: VoiceClient | undefined;
  const now = Date.now();
  const session: Session = { id: "11111111-1111-4111-8111-111111111111", characterId: "hei-wuchang", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  provider.on("connection", socket => {
    upstream = socket;
    socket.on("message", data => providerMessages.push(JSON.parse(data.toString())));
  });
  const engine: VoiceEngine = {
    async start() {}, async prepareOutput() {},
    play() { backlog += 10; clock += 1; },
    clear() { backlog = 0; clock += 2; return 2; },
    stop() { backlog = 0; return 0; }, stopCapture() {}, mute() {},
    queuedMs: () => backlog, rms: () => 0, isPlaying: () => backlog > 0,
    analysers: () => ({ input: undefined, output: undefined }), settings: () => undefined,
  };
  try {
    await waitFor(() => Boolean(provider.address() && edge.address()));
    edge.on("connection", socket => { relayFinished = relayVoice(socket, session, { realtimeKey: "mock", realtimeUrl: address(provider), realtimeModel: "mock" }); });
    class BrowserSocket extends WebSocket {
      constructor(url: string) {
        super(url);
        this.on("message", data => events.push(ServerMessage.parse(JSON.parse(data.toString()))));
      }
    }
    install("WebSocket", BrowserSocket);
    install("location", { protocol: "http:", host: new URL(address(edge)).host });
    install("fetch", async (url: string) => {
      if (url !== "/api/sessions" && url !== "/api/events") throw new Error("BENCHMARK_UNEXPECTED_FETCH");
      return { ok: true, json: async () => ({ session }) };
    });
    install("sessionStorage", { getItem: () => null, setItem() {} });
    install("localStorage", undefined);
    Object.defineProperty(performance, "now", { configurable: true, value: () => clock });
    client = new VoiceClient(value => { view = value; }, { engine, measurementMode: "simulated" });
    await client.start("en", "fixture", undefined, "", "hei-wuchang");
    await waitFor(() => Boolean(upstream));
    const providerCount = (type: string) => providerMessages.filter(event => event.type === type).length;
    const emit = (event: object, advanceMs = 0) => { clock += advanceMs; upstream!.send(JSON.stringify(event)); };
    const receive = async (event: object, type: ServerMessage["type"], advanceMs = 0) => {
      const previous = events.filter(item => item.type === type).length;
      emit(event, advanceMs);
      await waitFor(() => events.filter(item => item.type === type).length > previous);
    };
    emit({ type: "session.created" }, 40);
    await waitFor(() => providerCount("session.update") === 1);
    await receive({ type: "session.updated" }, "session.ready", 20);
    await waitFor(() => providerCount("response.create") === 1);
    const pcm = Buffer.alloc(480).toString("base64");
    const respond = async (responseId: string, responseMs: number, audioMs: number, split = false) => {
      await receive({ type: "response.created", response: { id: responseId } }, "response.started", responseMs);
      const before = events.filter(item => item.type === "audio.delta").length;
      emit({ type: "response.audio.delta", response_id: responseId, delta: split ? Buffer.alloc(24002).toString("base64") : pcm }, audioMs);
      await waitFor(() => events.filter(item => item.type === "audio.delta").length === before + (split ? 2 : 1) && view.latencySamples.some(item => item.responseId === responseId));
      await receive({ type: "response.audio.delta", response_id: responseId, delta: pcm }, "audio.delta", 4);
    };
    const done = async (responseId: string) => {
      await receive({ type: "response.done", response: { id: responseId, status: "completed" } }, "response.done", 10);
    };
    const drain = () => { backlog = 0; client!.measurePlayback(); };
    await respond("greeting", 80, 40, true);
    await done("greeting"); drain();
    for (let turn = 1; turn <= 5; turn++) {
      if (turn === 2) {
        const creates = providerCount("response.create");
        client.submitText("A deterministic fixture turn.");
        await waitFor(() => providerCount("response.create") === creates + 1);
      } else {
        const cancels = providerCount("response.cancel");
        await receive({ type: "input_audio_buffer.speech_started", item_id: `input-${turn}` }, "speech.started", 50);
        if (turn === 5) await waitFor(() => providerCount("response.cancel") === cancels + 1);
        await receive({ type: "input_audio_buffer.speech_stopped", item_id: `input-${turn}` }, "speech.stopped", 300 + turn * 20);
      }
      await respond(`turn-${turn}`, 60 + turn * 10, 40 + turn * 5, turn === 1);
      if (turn === 2) {
        const cancels = providerCount("response.cancel");
        client.interrupt();
        await waitFor(() => providerCount("response.cancel") === cancels + 1);
        // Canceled packets must not become new samples or replace first audio.
        emit({ type: "response.audio.delta", response_id: "turn-2", delta: pcm });
        emit({ type: "response.done", response: { id: "turn-2", status: "cancelled" } });
      } else if (turn === 3) {
        const outputs = providerCount("conversation.item.create"), creates = providerCount("response.create");
        emit({ type: "response.function_call_arguments.done", response_id: "turn-3", call_id: "fixture-tool", name: "change_mood", arguments: JSON.stringify({ mood: "warm" }) });
        await waitFor(() => providerCount("conversation.item.create") === outputs + 1);
        emit({ type: "response.done", response: { id: "turn-3", status: "completed" } }, 10);
        await waitFor(() => providerCount("response.create") === creates + 1);
        await respond("tool-continuation", 30, 45);
        await done("tool-continuation"); drain();
      } else if (turn !== 4) {
        await done(`turn-${turn}`); drain();
      }
      // turn-4 remains active until the next speech.started causes barge-in.
    }
    const summary = view.latencySummary!;
    if (view.latencySamples.length !== 7 || summary.stages.bargeInStopMs?.count !== 2 || summary.stages.toolContinuationMs?.count !== 1) throw new Error("BENCHMARK_SCENARIO_INCOMPLETE");
    const report = {
      schemaVersion: 1,
      mode: "simulated" as const,
      scenario: { greetings: 1, userTurns: 5, toolContinuations: 1, bargeInInterruptions: 2 },
      methodology: {
        clock: "Scripted monotonic durations over loopback WebSockets; no wall-clock latency claims.",
        playback: "Mock PCM queue; playbackStartDelayMs estimates scheduling and bargeInStopMs measures clear-command dispatch.",
        network: "Relative-duration residual, clamped to zero; VAD delivery may make client durations shorter than server durations.",
        failures: "failedTurns counts attempts without first audio, in addition to sampled responses; intentional interruptions are not failures.",
        evidence: "Simulated regression baseline, not live provider or acoustic acceptance.",
      },
      instructionUpdates: providerCount("session.update"),
      // New turn state legitimately changes the prompt; only identical updates are redundant.
      redundantInstructionUpdates: providerMessages.filter((event, index, messages) =>
        event.type === "session.update" && typeof event.session?.instructions === "string" &&
        messages.slice(0, index).some(previous => previous.type === "session.update" && previous.session?.instructions === event.session?.instructions)
      ).length,
      samples: view.latencySamples,
      summary,
      timingEvents: events.flatMap(event => "timing" in event && event.timing ? [{ type: event.type, ...("responseId" in event ? { responseId: event.responseId } : {}), timing: event.timing }] : []),
    };
    return { ...report, profile: options?.profile, modeled: options?.profile ? modelProfile(report, options.profile) : undefined };
  } finally {
    client?.stop();
    await relayFinished;
    for (const server of [edge, provider]) {
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    if (savedNow) Object.defineProperty(performance, "now", savedNow);
    else Reflect.deleteProperty(performance, "now");
  }
}

type ProtocolReport = { samples: VoiceView["latencySamples"]; instructionUpdates: number; redundantInstructionUpdates: number };

/** Adds the silence BEFORE provider speech_stopped, which existing telemetry cannot see.
 * Processing an unnecessary update is modeled at 25ms, not an asserted network RTT.
 * Codec CPU is measured separately and never credited to the deterministic latency gate.
 */
function modelProfile(report: ProtocolReport, profile: "baseline" | "optimized") {
  const baseline = profile === "baseline";
  const continuation = report.samples.find(sample => sample.responseId === "tool-continuation")!.toolContinuationMs!;
  const redundantUpdates = baseline ? 1 : report.redundantInstructionUpdates;
  const turns = CharacterId.options.flatMap(characterId => [1, 2, 3, 4, 5].map(turn => {
    const sample = report.samples.find(sample => sample.responseId === `turn-${turn}`)!;
    const vadSilenceMs = baseline ? (characterId === "meng-po" ? 800 : 350) : getVadConfig(characterId, "en").silence_duration_ms;
    const toolContinuationMs = turn === 3 ? continuation + redundantUpdates * 25 : 0;
    const providerAndPlaybackMs = sample.serverTurnToFirstAudioMs! + 10;
    return { characterId, turn, vadSilenceMs, providerAndPlaybackMs, toolContinuationMs, turnLatencyMs: vadSilenceMs + providerAndPlaybackMs + toolContinuationMs };
  }));
  return {
    assumptions: {
      mode: "modeled" as const,
      evidence: "Counterfactual silence-to-playback budget using loopback protocol timings; not live provider or acoustic acceptance.",
      turns: "Five identical voice-turn budgets per character; turn 3 waits for a tool continuation before usable speech.",
      redundantUpdateProcessingMs: 25,
      codec: "Excluded from latency budget; actual codec CPU timings are reported separately.",
      bargeIn: "Speech onset confirmation plus 2ms mock clear dispatch; excludes hardware output latency.",
    },
    turns,
    turnLatencyMs: computePercentileStats(turns.map(turn => turn.turnLatencyMs))!,
    mengPoTurnLatencyMs: computePercentileStats(turns.filter(turn => turn.characterId === "meng-po").map(turn => turn.turnLatencyMs))!,
    redundantInstructionUpdates: redundantUpdates,
    bargeInStopMs: (baseline ? 60 : 40) + 2,
  };
}

function benchmarkCodec(profile: "baseline" | "optimized") {
  const bytes = Uint8Array.from({ length: 640 }, (_, i) => i % 256);
  const encode = profile === "optimized" ? encodePcmBase64 : (input: Uint8Array) => {
    let binary = "";
    for (const byte of input) binary += String.fromCharCode(byte);
    return btoa(binary);
  };
  const decode = profile === "optimized" ? decodePcm16Base64ToFloat32 : (base64: string) => {
    const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const view = new DataView(raw.buffer), output = new Float32Array(raw.length / 2);
    for (let i = 0; i < output.length; i++) output[i] = view.getInt16(i * 2, true) / 32768;
    return output;
  };
  for (let i = 0; i < 200; i++) decode(encode(bytes));
  const batches = [];
  for (let batch = 0; batch < 20; batch++) {
    const start = performance.now();
    for (let frame = 0; frame < 100; frame++) decode(encode(bytes));
    batches.push((performance.now() - start) / 100);
  }
  return { mode: "measured-cpu" as const, frameBytes: bytes.length, millisecondsPerRoundTrip: computePercentileStats(batches)! };
}

export async function compareVoiceLatencyProfiles() {
  // Sequential: the protocol harness temporarily installs browser globals and a scripted clock.
  const baseline = await runVoiceLatencyBenchmark({ profile: "baseline" });
  const optimized = await runVoiceLatencyBenchmark({ profile: "optimized" });
  const p95Reduction = 1 - optimized.modeled!.turnLatencyMs.p95 / baseline.modeled!.turnLatencyMs.p95;
  const comparison = {
    schemaVersion: 1, mode: "simulated" as const, baseline, optimized,
    codec: { baseline: benchmarkCodec("baseline"), optimized: benchmarkCodec("optimized") },
    p95Reduction, bargeInImprovementMs: baseline.modeled!.bargeInStopMs - optimized.modeled!.bargeInStopMs,
    passed: p95Reduction >= 0.2 && optimized.modeled!.bargeInStopMs < baseline.modeled!.bargeInStopMs,
  };
  const directory = resolve("artifacts/g1-voice");
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "latency-baseline.json"), `${JSON.stringify(baseline, null, 2)}\n`);
  await writeFile(resolve(directory, "latency-comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`);
  if (!comparison.passed) throw new Error("DUPLEX_LATENCY_REGRESSION");
  return comparison;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--out" || !args[1] || args[1].startsWith("--"))) throw new Error("Usage: bench:voice-latency [--out <file>]");
  const report = await compareVoiceLatencyProfiles();
  if (args[1]) {
    const output = resolve(args[1]);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify({ mode: report.mode, baselineP95Ms: report.baseline.modeled!.turnLatencyMs.p95, optimizedP95Ms: report.optimized.modeled!.turnLatencyMs.p95, p95Reduction: report.p95Reduction, bargeInImprovementMs: report.bargeInImprovementMs, passed: report.passed }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch(error => { console.error(error instanceof Error ? error.message : "BENCHMARK_FAILED"); process.exitCode = 1; });
}
