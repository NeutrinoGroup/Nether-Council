/** Billable synthetic-audio check of the actual relay and provider. Never human acceptance. */
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import WebSocket, { WebSocketServer } from "ws";
import { ServerMessage } from "@nether/contracts";
import { relayVoice } from "../apps/web/src/features/voice/server/relay";
import { serverConfig } from "../apps/web/src/shared/server/config";
import { loadLocalEnv } from "./lib/env";

if (!process.argv.includes("--real-provider")) throw new Error("Opt in with --real-provider");
const repo = new URL("../", import.meta.url);
const envIndex = process.argv.indexOf("--env-dir");
if (envIndex >= 0) process.chdir(process.argv[envIndex + 1]);
loadLocalEnv();
process.chdir(fileURLToPath(repo));
const scenario = process.argv.includes("--anxiety") ? "anxiety" : "work";
const turnLimit = scenario === "anxiety" ? 2 : 3;
const config = serverConfig();
if (!config.realtimeKey) throw new Error("Missing realtime credentials");
const now = Date.now(), id = randomUUID();
const session = { id, characterId: "meng-po" as const, locale: "zh" as const, mode: "personal" as const, createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
const listener = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await once(listener, "listening");
listener.on("connection", ws => { void relayVoice(ws, session, config); });
const socket = new WebSocket(`ws://127.0.0.1:${(listener.address() as AddressInfo).port}`);
const events: ServerMessage[] = [], errors: string[] = [];
const captions: { text: string; chars: number; sentences: number }[] = [];
const report: Record<string, unknown> = { at: new Date().toISOString(), kind: "real_provider_synthetic_audio_actual_relay", model: config.realtimeModel, scenario, status: "pending" };
let seq = 0;
const send = (payload: object) => socket.send(JSON.stringify({ protocolVersion: 1, eventId: randomUUID(), sessionId: id, epoch: 0, seq: seq++, ...payload }));
socket.on("message", raw => {
  const e = ServerMessage.parse(JSON.parse(String(raw))); events.push(e);
  if (e.type === "error") errors.push(e.error.code);
  if (e.type === "caption" && e.caption.final && e.caption.speaker === "character") {
    const text = e.caption.sourceText;
    captions.push({ text, chars: [...text].length, sentences: text.split(/[。！？!?]+/u).filter(s => s.trim()).length });
  }
});
socket.on("error", () => errors.push("SOCKET_ERROR"));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitFor(condition: () => boolean) {
  const until = Date.now() + 40000;
  while (!condition()) {
    if (errors.length || socket.readyState === WebSocket.CLOSED) throw new Error(errors[0] ?? "SOCKET_CLOSED");
    if (Date.now() >= until) throw new Error("OBSERVATION_TIMEOUT");
    await sleep(50);
  }
}
try {
  await once(socket, "open"); send({ type: "session.start" });
  await waitFor(() => events.some(e => e.type === "response.done"));
  for (let turn = 1; turn <= turnLimit; turn++) {
    const before = events.filter(e => e.type === "response.done").length;
    const pcm = readFileSync(new URL(`../tests/fixtures/audio/${scenario === "anxiety" ? "soul_anxiety_zh" : "soul_zh"}_turn${turn}.pcm`, import.meta.url));
    for (let offset = 0; offset < pcm.length; offset += 3200) {
      if (socket.readyState !== WebSocket.OPEN || errors.length) throw new Error(errors[0] ?? "SOCKET_CLOSED");
      send({ type: "audio.append", audio: pcm.subarray(offset, offset + 3200).toString("base64") }); await sleep(100);
    }
    for (let i = 0; i < 12; i++) { send({ type: "audio.append", audio: Buffer.alloc(3200).toString("base64") }); await sleep(100); }
    await waitFor(() => events.filter(e => e.type === "response.done").length > before);
  }
  const actions = events.filter(e => e.type === "soul.action");
  const rituals = actions.filter(e => e.action.name === "trigger_soul_soup_ritual");
  Object.assign(report, { actions: actions.map(e => e.action), captions, audioChunks: events.filter(e => e.type === "audio.delta").length, userTurns: events.filter(e => e.type === "caption" && e.caption.final && e.caption.speaker === "user").length });
  if (!actions.some(e => e.action.name === "change_mood" && e.action.arguments.mood === (scenario === "anxiety" ? "healing" : "angry_support"))) throw new Error("MISSING_SUPPORT_MOOD");
  if (!actions.some(e => e.action.name === "extract_worry_keyword")) throw new Error("MISSING_WORRY");
  if (rituals.length !== 1) throw new Error("RITUAL_COUNT");
  if (captions.some(c => c.chars > 60 || c.chars < 30 || c.sentences < 2 || c.sentences > 3)) throw new Error("VOICE_BREVITY");
  report.status = "passed";
} catch (error) {
  report.status = error instanceof Error ? error.message : "failed";
  Object.assign(report, { captions, actions: events.filter(e => e.type === "soul.action").map(e => e.action), audioChunks: events.filter(e => e.type === "audio.delta").length });
  process.exitCode = 1;
} finally {
  if (socket.readyState === WebSocket.OPEN) send({ type: "session.end" });
  socket.close();
  for (const client of listener.clients) client.terminate();
  await new Promise<void>(r => listener.close(() => r()));
  Object.assign(report, { elapsedMs: Date.now() - now, errors });
  mkdirSync("artifacts/soul-soup", { recursive: true });
  writeFileSync(`artifacts/soul-soup/real-provider-${scenario}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
