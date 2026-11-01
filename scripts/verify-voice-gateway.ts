/** Real browser-protocol socket -> Node admission adapter -> FastAPI -> mock Qwen.
 * Uses only local sockets and fixture credentials. Run with pnpm verify:voice-gateway.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { once } from "node:events";
import WebSocket, { WebSocketServer } from "ws";
import { ServerMessage, type Session } from "@nether/contracts";
import { relayVoice } from "../apps/web/src/features/voice/server/relay";

const until = async (check: () => boolean, milliseconds = 8000) => {
  const end = Date.now() + milliseconds;
  while (!check()) {
    if (Date.now() >= end) throw new Error("Gateway verification timed out");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};
const portHolder = createServer().listen(0, "127.0.0.1"); await once(portHolder, "listening");
const port = (portHolder.address() as AddressInfo).port; await new Promise<void>(resolve => portHolder.close(() => resolve()));
const provider = new WebSocketServer({ port: 0, host: "127.0.0.1" }); await once(provider, "listening");
const edge = new WebSocketServer({ port: 0, host: "127.0.0.1" }); await once(edge, "listening");
const providerUrl = `ws://127.0.0.1:${(provider.address() as AddressInfo).port}`;
const edgeUrl = `ws://127.0.0.1:${(edge.address() as AddressInfo).port}`;
const secret = "local-gateway-verification-secret-32";
const gateway = spawn("uv", ["run", "--project", "services/voice", "--frozen", "uvicorn", "nether_voice.app:app", "--host", "127.0.0.1", "--port", String(port), "--log-level", "error"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, VOICE_GATEWAY_SECRET: secret, QWEN_DUPLEX_API_KEY: "fixture-provider-key", QWEN_REALTIME_URL: providerUrl, QWEN_REALTIME_MODEL: "fixture" } });
const logs: string[] = []; gateway.stderr.on("data", chunk => logs.push(String(chunk)));
let remote: WebSocket | undefined; let providerClosed = false; let relayClosed = false;
const upstream: Record<string, unknown>[] = []; let responses = 0;
provider.on("connection", (socket, request) => {
  assert.equal(request.headers.authorization, "Bearer fixture-provider-key");
  remote = socket; socket.send(JSON.stringify({ type: "session.created" }));
  socket.on("close", () => { providerClosed = true; });
  socket.on("message", raw => {
    const event = JSON.parse(String(raw)); upstream.push(event);
    if (event.type === "session.update") socket.send(JSON.stringify({ type: "session.updated" }));
    if (event.type === "response.create") {
      const id = `r${++responses}`;
      socket.send(JSON.stringify({ type: "response.created", response: { id } }));
      socket.send(JSON.stringify({ type: "response.audio.delta", response_id: id, delta: "AAA=" }));
    }
  });
});
let client: WebSocket | undefined;
try {
  const end = Date.now() + 10000;
  while (true) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited: ${logs.join("").slice(-200)}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    if (Date.now() >= end) throw new Error("Gateway health deadline exceeded");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const now = Date.now();
  const session: Session = { id: crypto.randomUUID(), characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  edge.on("connection", socket => { void relayVoice(socket, session, { gatewayUrl: `ws://127.0.0.1:${port}/realtime`, gatewaySecret: secret, realtimeKey: "unused-at-edge", realtimeUrl: providerUrl, realtimeModel: "fixture" }).then(() => { relayClosed = true; }); });
  client = new WebSocket(edgeUrl); const received: ServerMessage[] = [];
  client.on("message", raw => received.push(ServerMessage.parse(JSON.parse(String(raw)))));
  await once(client, "open"); let seq = 0;
  const send = (event: object) => client!.send(JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: session.id, epoch: 0, seq: seq++, ...event }));
  const emit = (event: object) => remote!.send(JSON.stringify(event));
  send({ type: "session.start" });
  await until(() => received.some(event => event.type === "audio.delta"));
  const tool = { type: "response.function_call_arguments.done", response_id: "r1", call_id: "c1", name: "change_mood", arguments: '{"mood":"storm"}' };
  emit(tool); emit(tool);
  send({ type: "audio.append", audio: "AAA=" });
  await until(() => received.some(event => event.type === "UI_ACTION") && upstream.some(event => event.type === "input_audio_buffer.append"));
  emit({ type: "response.done", response: { id: "r1", status: "completed" } });
  await until(() => received.some(event => event.type === "audio.delta" && event.responseId === "r2"));
  assert.equal(responses, 2); // The edge owns continuation, preventing two concurrent response.create events.
  assert.equal(upstream.filter(event => event.type === "conversation.item.create" && (event.item as { type?: string }).type === "function_call_output").length, 1);
  emit({ type: "input_audio_buffer.speech_started", item_id: "u1" });
  emit({ ...tool, response_id: "r2", call_id: "late" });
  emit({ type: "response.audio.delta", response_id: "r2", delta: "AAA=" });
  await until(() => upstream.some(event => event.type === "response.cancel"));
  send({ type: "ping" }); await until(() => received.some(event => event.type === "pong"));
  assert.equal(received.filter(event => event.type === "UI_ACTION").length, 1);
  assert.equal(received.filter(event => event.type === "audio.delta" && event.responseId === "r2").length, 1);
  send({ type: "text.submit", text: "Those meetings" });
  await until(() => received.some(event => event.type === "audio.delta" && event.responseId === "r3"));
  assert(received.some(event => event.type === "caption" && event.caption.sourceText === "Those meetings"));
  client.close(); await until(() => providerClosed && relayClosed);
  console.log("PASS: FastAPI duplex, concurrent microphone upload, UI_ACTION dedupe, one continuation, VAD/stale filtering, typed response, close cleanup.");
} finally {
  client?.terminate(); gateway.kill("SIGTERM");
  for (const server of [edge, provider]) { for (const socket of server.clients) socket.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); }
  if (gateway.exitCode === null) await Promise.race([once(gateway, "exit"), new Promise(resolve => setTimeout(resolve, 2000))]);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
