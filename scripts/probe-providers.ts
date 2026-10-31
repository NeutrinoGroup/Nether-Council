import { mkdirSync, writeFileSync } from "node:fs";
import WebSocket from "ws";
import { loadLocalEnv, safeCode } from "./lib/env";
loadLocalEnv();
const report: Record<string, unknown> = { at: new Date().toISOString(), containsSecrets: false };
const key = process.env.QWEN_DUPLEX_API_KEY;
const realtime = process.env.QWEN_REALTIME_URL ?? "wss://maas.qianwenaiapi.com/api-ws/v1/realtime";
const model = process.env.QWEN_REALTIME_MODEL ?? "qwen-audio-3.1-realtime-plus";
report.voice = await new Promise(resolve => {
  if (!key) return resolve({ status: "missing", variable: "QWEN_DUPLEX_API_KEY" });
  const url = new URL(realtime); url.searchParams.set("model", model);
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${key}` }, handshakeTimeout: 15_000 });
  let settled = false;
  function finish(result: object) { if (settled) return; settled = true; clearTimeout(timer); ws.close(); resolve({ endpoint: url.origin + url.pathname, model, ...result }); }
  const timer = setTimeout(() => { finish({ status: "timeout" }); ws.terminate(); }, 20_000);
  ws.on("unexpected-response", (_, res) => { res.resume(); finish({ status: "handshake_rejected", httpStatus: res.statusCode }); ws.terminate(); });
  ws.on("message", data => {
    try {
      const event = JSON.parse(data.toString());
      if (event.type === "session.created") finish({ status: "authenticated", event: event.type });
      else if (event.type === "error") finish({ status: "api_error", code: safeCode(event.error?.code) });
    } catch { finish({ status: "invalid_json" }); }
  });
  ws.on("error", () => finish({ status: "connection_error" }));
  ws.on("close", code => finish({ status: "closed_before_session", code }));
});
const textBase = process.env.QWEN_TEXT_BASE_URL ?? "https://maas.qianwenaiapi.com/compatible-mode/v1";
const textModel = process.env.QWEN_TEXT_MODEL ?? "qwen3.6-flash";
try {
  const response = await fetch(`${textBase}/chat/completions`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.QWEN_TEXT_API_KEY ?? key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: textModel, messages: [{ role: "user", content: "Reply OK." }], max_tokens: 8, enable_thinking: false }), signal: AbortSignal.timeout(25_000),
  });
  const data = await response.json();
  report.text = { endpoint: textBase, model: textModel, status: response.ok && data.choices?.[0]?.message?.content ? "authenticated" : "api_error", httpStatus: response.status, ...(response.ok ? {} : { code: safeCode(data.error?.code) }) };
} catch { report.text = { endpoint: textBase, model: textModel, status: "connection_error" }; }
const hunyuanBase = process.env.HUNYUAN_3D_BASE_URL ?? "https://api.ai3d.cloud.tencent.com";
try {
  const response = await fetch(`${hunyuanBase}/v1/ai3d/query`, {
    method: "POST", headers: { Authorization: process.env.HUNYUAN_3D_API_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ JobId: "0000000000000000000" }), signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  const code = safeCode(data.Response?.Error?.Code ?? data.error?.code ?? data.code);
  report.hunyuan = { endpoint: hunyuanBase, operation: "query_nonexistent_job", httpStatus: response.status, code, status: response.ok && code === "FailedOperation.JobNotFound" ? "authenticated" : "api_error" };
} catch { report.hunyuan = { endpoint: hunyuanBase, status: "connection_error" }; }
mkdirSync("artifacts/g0", { recursive: true });
writeFileSync("artifacts/g0/providers.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
