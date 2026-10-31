import WebSocket from "ws";
import { loadLocalEnv } from "./lib/env";
loadLocalEnv();

const key = process.env.QWEN_DUPLEX_API_KEY;
const realtime = process.env.QWEN_REALTIME_URL ?? "wss://maas.qianwenaiapi.com/api-ws/v1/realtime";
const model = process.env.QWEN_REALTIME_MODEL ?? "qwen-audio-3.1-realtime-plus";

async function testConnection(id: number): Promise<string> {
  const url = new URL(realtime);
  url.searchParams.set("model", model);
  return new Promise((resolve) => {
    const ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${key}` },
      handshakeTimeout: 15000,
    });
    const timer = setTimeout(() => {
      ws.terminate();
      resolve(`client ${id}: timeout`);
    }, 15000);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "session.created") {
          clearTimeout(timer);
          ws.close();
          resolve(`client ${id}: ok (session.created)`);
        } else if (msg.type === "error") {
          clearTimeout(timer);
          ws.close();
          resolve(`client ${id}: error:${msg.error?.code}`);
        }
      } catch {
        resolve(`client ${id}: invalid_json`);
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      resolve(`client ${id}: ws_error:${err.message}`);
    });
  });
}

async function main() {
  console.log("Probing 10 simultaneous connections directly to Qwen Realtime WebSocket:");
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => testConnection(i + 1))
  );
  console.log(results);
}

void main();
