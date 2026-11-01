import { afterEach, expect, test, vi } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { ServerMessage, type Session } from "@nether/contracts";
import { relayVoice } from "../../apps/web/src/features/voice/server/relay";
const servers: WebSocketServer[] = [];
afterEach(async () => { vi.unstubAllGlobals(); for (const server of servers.splice(0)) { for (const client of server.clients) client.terminate(); await new Promise<void>(r => server.close(() => r())); } });
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
  expect(upstreamMessages.find(e => e.type === "session.update")?.session).toMatchObject({ input_audio_format: "pcm", voice: "longanqian_v3.1", turn_detection: { type: "server_vad", silence_duration_ms: 350 } });
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
  // A delayed cancel from the previous audible response cannot stop the new response.
  client.send(JSON.stringify({ ...envelope(2), type: "response.cancel", responseId: "a" }));
  client.send(JSON.stringify({ ...envelope(3), type: "ping" }));
  await waitFor(() => received.some(e => e.type === "pong"));
  expect(upstreamMessages.filter(e => e.type === "response.cancel")).toHaveLength(1);
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
test("confirmed captions translate off the audio path; cancel, VAD and close invalidate pending work", async () => {
  const jobs: { resolve: (response: Response) => void; signal: AbortSignal }[] = [];
  vi.stubGlobal("fetch", vi.fn((_: string, init: RequestInit) => new Promise<Response>(resolve => jobs.push({ resolve, signal: init.signal! }))));
  const provider = await server(); const downstream = await server(); let remote: WebSocket | undefined;
  provider.on("connection", ws => { remote = ws; ws.send(JSON.stringify({ type: "session.created" })); ws.on("message", raw => { if (JSON.parse(raw.toString()).type === "session.update") ws.send(JSON.stringify({ type: "session.updated" })); }); });
  downstream.on("connection", ws => { void relayVoice(ws, session(), { realtimeKey: "fixture", realtimeUrl: url(provider), realtimeModel: "fixture", text: { key: "fixture", baseUrl: "https://text.example", model: "fixture" } }); });
  const client = new WebSocket(url(downstream)); const received: ReturnType<typeof ServerMessage.parse>[] = [];
  client.on("message", raw => received.push(ServerMessage.parse(JSON.parse(raw.toString())))); await once(client, "open");
  client.send(JSON.stringify({ ...envelope(0), type: "session.start" })); await waitFor(() => received.some(e => e.type === "session.ready"));
  const emit = (event: object) => remote!.send(JSON.stringify(event));
  const respond = (id: string) => { emit({ type: "response.created", response: { id } }); emit({ type: "response.audio.delta", response_id: id, delta: "AAA=" }); emit({ type: "response.audio_transcript.delta", response_id: id, delta: "Tell me about the meeting." }); emit({ type: "response.done", response: { id, status: "completed" } }); };
  const resolve = (i: number) => jobs[i].resolve(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"translation":"说说那场会。"}' } }] })));
  respond("a"); await waitFor(() => jobs.length === 1 && received.some(e => e.type === "response.done"));
  expect(received.some(e => e.type === "audio.delta")).toBe(true); expect(received.some(e => e.type === "caption.translation")).toBe(false);
  // Generation already ended; cancelling its still-audible playback must also cancel translation.
  client.send(JSON.stringify({ ...envelope(1), type: "response.cancel", responseId: "a" })); await waitFor(() => jobs[0].signal.aborted); resolve(0);
  respond("b"); await waitFor(() => jobs.length === 2);
  emit({ type: "input_audio_buffer.speech_started", item_id: "u2" }); await waitFor(() => jobs[1].signal.aborted);
  emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "A late old story." });
  emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "u2", transcript: "The meeting was at midnight." });
  await waitFor(() => jobs.length === 3 && received.some(e => e.type === "caption" && e.caption.speaker === "user")); expect(received.filter(e => e.type === "caption" && e.caption.speaker === "user")).toHaveLength(1);
  respond("c"); await waitFor(() => jobs.length === 4 && received.some(e => e.type === "audio.delta" && e.responseId === "c"));
  resolve(2); await waitFor(() => received.some(e => e.type === "caption.translation"));
  expect(received.filter(e => e.type === "caption.translation")).toMatchObject([{ translation: { responseId: "u2", status: "ready" } }]);
  client.close(); await waitFor(() => jobs[3].signal.aborted); resolve(1); resolve(3);
});

test.each([false, true])("finalization is single-flight, stops capture and aborts on close=%s", async closeEarly => {
  let resolveResult: ((response: Response) => void) | undefined;
  let resultSignal: AbortSignal | undefined;
  let resultRequests = 0;
  vi.stubGlobal("fetch", vi.fn((_: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (String(body.messages[0].content).includes("personalized afterlife Halloween identity result")) {
      resultRequests++; resultSignal = init.signal!;
      return new Promise<Response>(resolve => { resolveResult = resolve; });
    }
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"translation":"会议开到了半夜。"}' } }] })));
  }));
  const provider = await server(); const downstream = await server();
  let remote: WebSocket | undefined; let finished = false;
  const requests: Record<string, unknown>[] = [];
  provider.on("connection", ws => { remote = ws; ws.send(JSON.stringify({ type: "session.created" })); ws.on("message", raw => { const event = JSON.parse(String(raw)); requests.push(event); if (event.type === "session.update") ws.send(JSON.stringify({ type: "session.updated" })); }); });
  downstream.on("connection", ws => { void relayVoice(ws, session(), { realtimeKey: "fixture", realtimeUrl: url(provider), realtimeModel: "fixture", text: { key: "fixture", baseUrl: "https://text.example", model: "fixture" } }).then(() => { finished = true; }); });
  const client = new WebSocket(url(downstream)); const received: ReturnType<typeof ServerMessage.parse>[] = [];
  client.on("message", raw => received.push(ServerMessage.parse(JSON.parse(String(raw)))));
  await once(client, "open"); let seq = 0;
  const send = (event: object) => client.send(JSON.stringify({ ...envelope(seq++), ...event }));
  send({ type: "session.start" }); await waitFor(() => received.some(e => e.type === "session.ready"));
  remote!.send(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "My boss scheduled a midnight meeting." }));
  await waitFor(() => received.some(e => e.type === "caption" && e.caption.speaker === "user"));
  send({ type: "session.finalize" }); send({ type: "session.finalize" });
  await waitFor(() => resultRequests === 1);
  send({ type: "audio.append", audio: "AAA=" }); send({ type: "ping" });
  remote!.send(JSON.stringify({ type: "input_audio_buffer.speech_started", item_id: "late-mic" }));
  remote!.send(JSON.stringify({ type: "response.created", response: { id: "late-generation" } }));
  remote!.send(JSON.stringify({ type: "response.audio.delta", response_id: "late-generation", delta: "AAA=" }));
  await waitFor(() => received.some(e => e.type === "pong") && requests.some(e => e.type === "response.cancel"));
  expect(requests.some(e => e.type === "input_audio_buffer.append")).toBe(false);
  expect(received.some(e => e.type === "speech.started" || e.type === "audio.delta")).toBe(false);
  if (closeEarly) { client.close(); await waitFor(() => finished); expect(resultSignal?.aborted).toBe(true); }
  resolveResult!(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ title: { zh: "夜会散场官", en: "Midnight Meeting Adjourner" }, verdict: { zh: "把半夜会议留给南瓜汤。", en: "Leave that midnight meeting in the soup." }, warmClosing: { zh: "今晚早点休息。", en: "Rest well tonight." }, tags: [{ zh: "散场", en: "Adjourned" }, { zh: "安睡", en: "Rest" }], sourceTurnIds: ["u1"] }) } }] })));
  if (!closeEarly) {
    await waitFor(() => received.some(e => e.type === "result") && requests.filter(e => e.type === "response.create").length === 2);
    expect(received.filter(e => e.type === "result")).toHaveLength(1);
    const closing = requests.filter(e => e.type === "conversation.item.create").at(-1);
    expect(JSON.stringify(closing)).toContain("Midnight Meeting Adjourner. Rest well tonight.");
    client.close(); await waitFor(() => finished);
  } else {
    await new Promise(r => setTimeout(r, 20));
    expect(received.some(e => e.type === "result")).toBe(false);
    expect(requests.filter(e => e.type === "response.create")).toHaveLength(1);
  }
  expect(resultRequests).toBe(1);
});

test("prewarm establishes upstream session ahead of mic activation; activating triggers opening line immediately", async () => {
  const provider = await server(); const downstream = await server();
  const upstreamMessages: Record<string, unknown>[] = [];
  provider.on("connection", ws => {
    ws.send(JSON.stringify({ type: "session.created" }));
    ws.on("message", raw => {
      const event = JSON.parse(String(raw));
      upstreamMessages.push(event);
      if (event.type === "session.update") ws.send(JSON.stringify({ type: "session.updated" }));
    });
  });
  downstream.on("connection", ws => {
    void relayVoice(ws, session(), { realtimeKey: "fixture", realtimeUrl: url(provider), realtimeModel: "fixture" });
  });
  const client = new WebSocket(url(downstream));
  const received: ReturnType<typeof ServerMessage.parse>[] = [];
  client.on("message", raw => received.push(ServerMessage.parse(JSON.parse(String(raw)))));
  await once(client, "open");
  client.send(JSON.stringify({ ...envelope(0), type: "session.start", prewarm: true }));
  await waitFor(() => upstreamMessages.some(e => e.type === "session.update"));
  await new Promise(r => setTimeout(r, 30));
  expect(upstreamMessages.some(e => e.type === "conversation.item.create")).toBe(false);
  expect(received.some(e => e.type === "session.ready")).toBe(false);
  client.send(JSON.stringify({ ...envelope(1), type: "session.start" }));
  await waitFor(() => received.some(e => e.type === "session.ready"));
  expect(upstreamMessages.some(e => e.type === "conversation.item.create")).toBe(true);
  client.close();
});
