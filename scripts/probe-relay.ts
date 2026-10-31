import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { ServerMessage, Session } from "@nether/contracts";
import { signTicket } from "../apps/web/src/shared/server/tickets";
import { loadLocalEnv } from "./lib/env";
loadLocalEnv();
const flag = process.argv.indexOf("--url"); const base = process.argv[flag + 1];
if (flag < 0 || !base?.startsWith("https://")) throw new Error("Provide --url https://<preview>");
const origin = new URL(base).origin; const now = Date.now();
const invite = signTicket({ kind: "campaign", campaignId: process.env.NEXT_PUBLIC_CAMPAIGN_ID ?? "halloween-2026", issuedAt: now, expiresAt: now + 600000 }, process.env.CAMPAIGN_SIGNING_SECRET ?? "");
const response = await fetch(`${origin}/api/sessions`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ characterId: "meng-po", locale: "en", mode: "personal", invite }) });
if (!response.ok) throw new Error(`Admission returned HTTP ${response.status}`);
const session = Session.parse((await response.json()).session);
const cookie = response.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Missing session cookie");
const start = performance.now();
const ws = new WebSocket(`${origin.replace("https:", "wss:")}/api/ws`, { headers: { Origin: origin, Cookie: cookie } });
const metrics = { at: new Date().toISOString(), sessionId: session.id, model: process.env.QWEN_REALTIME_MODEL ?? "qwen-audio-3.1-realtime-plus", readyMs: -1, firstAudioMs: -1, audioBytes: 0, cancelSent: false, postCancelAudioChunks: 0, status: "pending", url: origin, kind: "automated_provider_greeting_not_human_duplex_acceptance" };
let seq = 0; let canceled = false;
function send(type: string) { ws.send(JSON.stringify({ protocolVersion: 1, eventId: randomUUID(), sessionId: session.id, epoch: 0, seq: seq++, type })); }
await new Promise<void>(resolve => {
  const deadline = setTimeout(() => { metrics.status = "timeout"; ws.terminate(); }, 30000);
  ws.on("open", () => send("session.start"));
  ws.on("message", raw => {
    let event;
    try { event = ServerMessage.parse(JSON.parse(raw.toString())); } catch { metrics.status = "invalid_protocol"; ws.close(); return; }
    if (event.type === "session.ready") metrics.readyMs = Math.round(performance.now() - start);
    if (event.type === "error") { metrics.status = event.error.code; ws.close(); }
    if (event.type === "audio.delta") {
      metrics.audioBytes += Buffer.from(event.audio, "base64").length;
      if (canceled) metrics.postCancelAudioChunks++;
      if (metrics.firstAudioMs < 0) {
        metrics.firstAudioMs = Math.round(performance.now() - start); canceled = true; metrics.cancelSent = true; send("response.cancel");
        setTimeout(() => { metrics.status = "greeting_audio_and_cancel_received"; send("session.end"); ws.close(); }, 1000);
      }
    }
  });
  ws.on("unexpected-response", (_, res) => { res.resume(); metrics.status = `handshake_http_${res.statusCode}`; ws.terminate(); });
  ws.on("error", () => { if (metrics.status === "pending") metrics.status = "connection_error"; });
  ws.on("close", () => { clearTimeout(deadline); resolve(); });
});
mkdirSync("artifacts/g1-voice", { recursive: true });
writeFileSync("artifacts/g1-voice/relay-probe.json", JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
if (metrics.status !== "greeting_audio_and_cancel_received") process.exitCode = 1;
