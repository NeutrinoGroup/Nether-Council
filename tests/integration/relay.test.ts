import { afterEach, expect, test } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { ServerMessage, type Session } from "@nether/contracts";
import { relayVoice } from "../../apps/web/src/features/voice/server/relay";
const servers: WebSocketServer[] = [];
afterEach(async () => { for (const server of servers.splice(0)) { for (const client of server.clients) client.terminate(); await new Promise<void>(r => server.close(() => r())); } });
async function server() { const s = new WebSocketServer({ port: 0, host: "127.0.0.1" }); servers.push(s); await once(s, "listening"); return s; }
const url = (s: WebSocketServer) => `ws://127.0.0.1:${(s.address() as AddressInfo).port}`;
const id = "11111111-1111-4111-8111-111111111111";
const session = (): Session => { const now = Date.now(); return { id, characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 10000, expiresAt: now + 20000 }; };
const envelope = (seq: number) => ({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq });
const waitFor = async (condition: () => boolean) => { const until = Date.now() + 2000; while (!condition()) { if (Date.now() > until) throw new Error("Timed out"); await new Promise(r => setTimeout(r, 5)); } };
test("bridge keeps uploading while speaking; barge-in drops old audio and closes upstream", async () => {
  const provider = await server(); const downstream = await server();
  const upstreamMessages: Record<string, unknown>[] = [];
  let remote: WebSocket | undefined; let upstreamClosed = false; let finished = false;
  provider.on("connection", ws => { remote = ws; ws.send(JSON.stringify({ type: "session.created" })); ws.on("message", raw => { const event = JSON.parse(raw.toString()); upstreamMessages.push(event); if (event.type === "session.update") ws.send(JSON.stringify({ type: "session.updated" })); }); ws.on("close", () => { upstreamClosed = true; }); });
  downstream.on("connection", ws => { void relayVoice(ws, session(), { realtimeKey: "test-not-real", realtimeUrl: url(provider), realtimeModel: "test-fixture" }).then(() => { finished = true; }); });
  const client = new WebSocket(url(downstream)); const received: ReturnType<typeof ServerMessage.parse>[] = [];
  client.on("message", raw => received.push(ServerMessage.parse(JSON.parse(raw.toString())))); await once(client, "open");
  client.send(JSON.stringify({ ...envelope(0), type: "session.start" }));
  await waitFor(() => received.some(e => e.type === "session.ready"));
  expect(upstreamMessages.find(e => e.type === "session.update")?.session).toMatchObject({ input_audio_format: "pcm", voice: "longanqian_v3.1", turn_detection: { type: "smart_turn_v2" } });
  expect(upstreamMessages.find(e => e.type === "conversation.item.create")?.item).toMatchObject({ id: "opening_request", role: "user" });
  remote!.send(JSON.stringify({ type: "response.created", response: { id: "a" } }));
  remote!.send(JSON.stringify({ type: "response.audio.delta", response_id: "a", delta: Buffer.alloc(100000).toString("base64") }));
  await waitFor(() => received.filter(e => e.type === "audio.delta").length === 5);
  client.send(JSON.stringify({ ...envelope(1), type: "audio.append", audio: "AAA=" }));
  await waitFor(() => upstreamMessages.some(e => e.type === "input_audio_buffer.append"));
  remote!.send(JSON.stringify({ type: "input_audio_buffer.speech_started" }));
  remote!.send(JSON.stringify({ type: "response.audio.delta", response_id: "a", delta: "AAAA" }));
  remote!.send(JSON.stringify({ type: "response.done", response: { id: "a", status: "cancelled" } }));
  await waitFor(() => received.some(e => e.type === "speech.started") && upstreamMessages.some(e => e.type === "response.cancel"));
  expect(received.filter(e => e.type === "audio.delta")).toHaveLength(5);
  // Qwen may finish inference before the cancel reaches it, while audio is still in flight.
  remote!.send(JSON.stringify({ type: "error", error: { type: "invalid_request_error", code: "invalid_value", message: "Conversation has no active response.", param: "response.cancel" } }));
  remote!.send(JSON.stringify({ type: "response.created", response: { id: "b" } }));
  remote!.send(JSON.stringify({ type: "response.audio.delta", response_id: "b", delta: "AAA=" }));
  await waitFor(() => received.some(e => e.type === "audio.delta" && e.responseId === "b") || received.some(e => e.type === "error"));
  expect(received.some(e => e.type === "error")).toBe(false);
  expect(received.some(e => e.type === "audio.delta" && e.responseId === "b")).toBe(true);
  // The same generic error code for a different problem must still fail closed.
  remote!.send(JSON.stringify({ type: "error", error: { type: "invalid_request_error", code: "invalid_value", message: "Unsupported voice.", param: "session.voice" } }));
  await waitFor(() => received.some(e => e.type === "error"));
  expect(received.find(e => e.type === "error")?.error.code).toBe("UPSTREAM_UNAVAILABLE");
  client.close(); await waitFor(() => upstreamClosed && finished);
});
test("wrong first-session ownership never opens a paid upstream", async () => {
  const provider = await server(); const downstream = await server(); let paidConnections = 0;
  provider.on("connection", () => { paidConnections++; });
  downstream.on("connection", ws => { void relayVoice(ws, session(), { realtimeKey: "test-not-real", realtimeUrl: url(provider), realtimeModel: "test-fixture" }); });
  const client = new WebSocket(url(downstream)); await once(client, "open");
  const closed = once(client, "close");
  client.send(JSON.stringify({ ...envelope(0), sessionId: "22222222-2222-4222-8222-222222222222", type: "session.start" }));
  await closed; expect(paidConnections).toBe(0);
});
