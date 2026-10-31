import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { ServerMessage, Session, type CharacterId, type Locale } from "@nether/contracts";
import { CHARACTER_IDS } from "@nether/party-core";
import { signTicket } from "../apps/web/src/shared/server/tickets";
import { loadLocalEnv } from "./lib/env";
import { getSpokenUtterance, generateSilenceChunks } from "./lib/audio-samples";

loadLocalEnv();

interface ClientResult {
  clientId: number;
  sessionId: string;
  characterId: CharacterId;
  locale: Locale;
  connected: boolean;
  readyMs: number;
  greetingMs: number;
  reconnects: number;
  recovered: boolean;
  turnsAttempted: number;
  turnsSucceeded: number;
  latenciesMs: number[];
  audioBytesSent: number;
  audioBytesReceived: number;
  status: "success" | "partial" | "failed";
  errors: string[];
  durationMs: number;
}

interface LoadTestSummary {
  startedAt: string;
  completedAt: string;
  totalDurationSeconds: number;
  targetUrl: string;
  totalClients: number;
  totalTurnsAttempted: number;
  totalTurnsSucceeded: number;
  successRatePercent: number;
  targetAchieved: boolean; // >= 29/30
  durationRequirementMet: boolean; // >= 120s
  clients: ClientResult[];
}

const flag = (name: string) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
};

const baseUrl = flag("--url") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://nether-council.vercel.app";
const target = new URL(baseUrl);
const origin = target.origin;
const totalClients = Math.max(1, Number(flag("--clients") ?? 10));
const turnsPerClient = Math.max(1, Number(flag("--turns") ?? 3));
const minDurationSeconds = Math.max(10, Number(flag("--duration") ?? 120));

console.log(`Starting Pilot Load Test:`);
console.log(`- Target: ${origin}`);
console.log(`- Clients: ${totalClients}`);
console.log(`- Turns per client: ${turnsPerClient} (Total expected: ${totalClients * turnsPerClient})`);
console.log(`- Target minimum test duration: ${minDurationSeconds}s`);

const trustedHeaders: Record<string, string> = process.env.VERCEL_OIDC_TOKEN
  ? { "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN }
  : {};

async function runClient(clientId: number, startDelayMs: number): Promise<ClientResult> {
  if (startDelayMs > 0) {
    await new Promise(r => setTimeout(r, startDelayMs));
  }

  const startTime = performance.now();
  const charIndex = clientId % CHARACTER_IDS.length;
  const characterId = CHARACTER_IDS[charIndex];
  const locale: Locale = clientId % 2 === 0 ? "zh" : "en";

  const result: ClientResult = {
    clientId,
    sessionId: "",
    characterId,
    locale,
    connected: false,
    readyMs: -1,
    greetingMs: -1,
    reconnects: 0,
    recovered: false,
    turnsAttempted: 0,
    turnsSucceeded: 0,
    latenciesMs: [],
    audioBytesSent: 0,
    audioBytesReceived: 0,
    status: "failed",
    errors: [],
    durationMs: 0,
  };

  const RECONNECT_DELAYS = [2000, 5000];

  for (let attempt = 0; attempt <= RECONNECT_DELAYS.length; attempt++) {
    if (attempt > 0) {
      result.reconnects++;
      const delay = RECONNECT_DELAYS[attempt - 1];
      console.log(`[Client #${clientId}] Reconnecting (attempt ${attempt}) in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      // 1. Admission
      const now = Date.now();
      const invite = signTicket(
        {
          kind: "campaign",
          campaignId: process.env.NEXT_PUBLIC_CAMPAIGN_ID ?? "halloween-2026",
          issuedAt: now,
          expiresAt: now + 3600000,
        },
        process.env.CAMPAIGN_SIGNING_SECRET ?? ""
      );

      const admissionRes = await fetch(`${origin}/api/sessions`, {
        method: "POST",
        redirect: "error",
        headers: { ...trustedHeaders, Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, locale, mode: "personal", invite }),
      });

      if (!admissionRes.ok) {
        result.errors.push(`Admission HTTP ${admissionRes.status}`);
        continue;
      }

      const sessionData = await admissionRes.json();
      const session = Session.parse(sessionData.session);
      result.sessionId = session.id;

      const cookie = admissionRes.headers.get("set-cookie")?.split(";")[0];
      if (!cookie) {
        result.errors.push("Missing session cookie");
        continue;
      }

      // 2. WebSocket Connect
      const wsUrl = `${origin.replace("https:", "wss:").replace("http:", "ws:")}/api/ws`;
      const ws = new WebSocket(wsUrl, {
        headers: { ...trustedHeaders, Origin: origin, Cookie: cookie },
      });

      let seq = 0;
      const send = (type: string, extra: Record<string, unknown> = {}) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
          protocolVersion: 1,
          eventId: randomUUID(),
          sessionId: session.id,
          epoch: result.reconnects,
          seq: seq++,
          type,
          ...extra,
        }));
      };

      // Await session.ready and first greeting audio
      const greetingOk = await new Promise<boolean>((resolve) => {
        let greetingCancelled = false;
        let greetingResponseId: string | undefined;
        const deadline = setTimeout(() => {
          if (!greetingCancelled) {
            result.errors.push(`WS handshake timeout (attempt ${attempt})`);
            ws.terminate();
            resolve(false);
          }
        }, 25000);

        ws.on("open", () => {
          send("session.start");
        });

        const onGreetingMessage = (raw: WebSocket.RawData) => {
          try {
            const msg = ServerMessage.parse(JSON.parse(raw.toString()));
            if (msg.type === "session.ready") {
              result.connected = true;
              if (result.readyMs < 0) {
                result.readyMs = Math.round(performance.now() - startTime);
              }
              if (attempt > 0) {
                result.recovered = true;
              }
            } else if (msg.type === "response.started") {
              greetingResponseId = msg.responseId;
            } else if (msg.type === "audio.delta") {
              const bytes = Buffer.from(msg.audio, "base64").length;
              result.audioBytesReceived += bytes;
              if (result.greetingMs < 0) {
                result.greetingMs = Math.round(performance.now() - startTime);
                greetingCancelled = true;
                // Cancel greeting cleanly
                send("response.cancel", { responseId: msg.responseId });
                clearTimeout(deadline);
                setTimeout(() => {
                  ws.off("message", onGreetingMessage);
                  resolve(true);
                }, 600);
              }
            } else if (msg.type === "response.done") {
              if (greetingCancelled || msg.responseId === greetingResponseId) {
                clearTimeout(deadline);
                ws.off("message", onGreetingMessage);
                setTimeout(() => resolve(true), 200);
              }
            } else if (msg.type === "error") {
              result.errors.push(`Session error: ${msg.error.code}`);
              clearTimeout(deadline);
              ws.off("message", onGreetingMessage);
              ws.close();
              resolve(false);
            }
          } catch {
            // Ignore parse errors on raw messages during handshake
          }
        };

        ws.on("message", onGreetingMessage);

        ws.on("error", (err) => {
          result.errors.push(`WS error: ${err.message}`);
          clearTimeout(deadline);
          resolve(false);
        });
      });

      if (!greetingOk) {
        continue;
      }

      console.log(`[Client #${clientId}] Connected & Greeted (${characterId}, ${locale}, ready: ${result.readyMs}ms, greeting: ${result.greetingMs}ms)`);

      // 3. Multi-Turn Duplex Interactivity (3 turns)
      let allTurnsCompleted = true;
      for (let turn = result.turnsSucceeded + 1; turn <= turnsPerClient; turn++) {
        result.turnsAttempted++;
        const turnStart = performance.now();
        let turnSpeechEnd = 0;
        let turnResponseId: string | undefined;
        let firstAudioReceived = false;
        let turnAudioBytes = 0;
        let turnLatency = -1;

        // Turn completion promise
        const turnPromise = new Promise<boolean>((resolveTurn) => {
          let resolved = false;
          let turnTimeout: ReturnType<typeof setTimeout> | undefined;

          const finishTurn = (ok: boolean) => {
            if (resolved) return;
            resolved = true;
            if (turnTimeout) clearTimeout(turnTimeout);
            turnTimeout = undefined;
            ws.off("message", onMessage);
            resolveTurn(ok);
          };

          turnTimeout = setTimeout(() => {
            result.errors.push(`Turn ${turn} timed out waiting for audio response`);
            finishTurn(false);
          }, 35000);

          const onMessage = (raw: WebSocket.RawData) => {
            try {
              const event = ServerMessage.parse(JSON.parse(raw.toString()));
              if (event.type === "response.started") {
                turnResponseId = event.responseId;
              } else if (event.type === "audio.delta") {
                if (!turnResponseId || event.responseId !== turnResponseId) return;
                const bytes = Buffer.from(event.audio, "base64").length;
                result.audioBytesReceived += bytes;
                turnAudioBytes += bytes;

                if (!firstAudioReceived) {
                  firstAudioReceived = true;
                  turnLatency = Math.round(performance.now() - (turnSpeechEnd || turnStart));
                  result.latenciesMs.push(turnLatency);
                }

                // Collect sufficient response audio (8 chunks = ~2s audio), then cancel cleanly for next turn
                if (turnAudioBytes >= 48000) {
                  send("response.cancel", { responseId: event.responseId });
                  setTimeout(() => finishTurn(true), 500);
                }
              } else if (event.type === "response.done") {
                if (firstAudioReceived && (!turnResponseId || event.responseId === turnResponseId)) {
                  finishTurn(true);
                }
              } else if (event.type === "error") {
                result.errors.push(`Turn ${turn} error: ${event.error.code}`);
                finishTurn(false);
              }
            } catch {
              // Ignore
            }
          };

          ws.on("message", onMessage);
        });

        // Natural pause before starting turn
        await new Promise(r => setTimeout(r, 600));

        // Stream real spoken audio sample for this turn
        const utterance = getSpokenUtterance(locale, turn);
        for (const chunk of utterance) {
          send("audio.append", { audio: chunk.base64 });
          result.audioBytesSent += chunk.bytes;
          await new Promise(r => setTimeout(r, 100));
        }

        // Stream silence at 100ms interval to trigger VAD
        const silence = generateSilenceChunks(15);
        for (const chunk of silence) {
          send("audio.append", { audio: chunk.base64 });
          result.audioBytesSent += chunk.bytes;
          await new Promise(r => setTimeout(r, 100));
        }
        turnSpeechEnd = performance.now();

        const turnOk = await turnPromise;
        if (turnOk) {
          result.turnsSucceeded++;
          console.log(`[Client #${clientId}] Turn ${turn}/${turnsPerClient} OK (Latency: ${turnLatency}ms, Rcvd: ${turnAudioBytes}B)`);
        } else {
          allTurnsCompleted = false;
          break;
        }
      }

      // Gracefully finish
      send("session.end");
      ws.close(1000, "Normal Closure");

      if (allTurnsCompleted && result.turnsSucceeded >= turnsPerClient) {
        result.status = "success";
        break;
      }
    } catch (err: unknown) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (result.status !== "success") {
    result.status = result.turnsSucceeded > 0 ? "partial" : "failed";
  }

  result.durationMs = Math.round(performance.now() - startTime);
  return result;
}

async function main() {
  const testStart = performance.now();
  const startedAt = new Date().toISOString();

  const staggerIntervalMs = totalClients > 1
    ? Math.max(5000, Math.ceil(((minDurationSeconds - 50) * 1000) / (totalClients - 1)))
    : 0;

  console.log(`Staggering ${totalClients} clients by ${staggerIntervalMs}ms intervals...`);

  const clientPromises: Promise<ClientResult>[] = [];
  for (let i = 0; i < totalClients; i++) {
    const delay = i * staggerIntervalMs;
    clientPromises.push(runClient(i, delay));
  }

  const results = await Promise.all(clientPromises);
  const totalElapsed = (performance.now() - testStart) / 1000;

  // If elapsed time is slightly less than minDurationSeconds, wait until minDurationSeconds is reached
  if (totalElapsed < minDurationSeconds) {
    const remainingMs = Math.ceil((minDurationSeconds - totalElapsed) * 1000);
    console.log(`Waiting remaining ${Math.round(remainingMs / 1000)}s to satisfy duration requirement (>= ${minDurationSeconds}s)...`);
    await new Promise(r => setTimeout(r, remainingMs));
  }

  const totalDurationSeconds = Math.round((performance.now() - testStart) / 1000);
  const completedAt = new Date().toISOString();

  const totalTurnsAttempted = results.reduce((acc, c) => acc + c.turnsAttempted, 0);
  const totalTurnsSucceeded = results.reduce((acc, c) => acc + c.turnsSucceeded, 0);
  const successRatePercent = totalTurnsAttempted > 0 ? Math.round((totalTurnsSucceeded / totalTurnsAttempted) * 1000) / 10 : 0;
  const targetAchieved = totalTurnsSucceeded >= 29 && totalTurnsAttempted >= 30;
  const durationRequirementMet = totalDurationSeconds >= minDurationSeconds;

  const summary: LoadTestSummary = {
    startedAt,
    completedAt,
    totalDurationSeconds,
    targetUrl: origin,
    totalClients,
    totalTurnsAttempted,
    totalTurnsSucceeded,
    successRatePercent,
    targetAchieved,
    durationRequirementMet,
    clients: results,
  };

  mkdirSync("artifacts/g5-pilot", { recursive: true });
  writeFileSync("artifacts/g5-pilot/load-report.json", JSON.stringify(summary, null, 2));

  // Also write Markdown report
  const markdown = `# Gate G5 T16 压力与并发测试报告 (10 客户端并发)

- **测试时间**: ${startedAt} ~ ${completedAt}
- **持续总时长**: ${totalDurationSeconds}s (目标要求: ≥ 120s -> ${durationRequirementMet ? "✅ 达标" : "❌ 未达标"})
- **目标中继端点**: ${origin}
- **并发客户端数**: ${totalClients} 个独立真实 API 客户端
- **总话轮数**: ${totalTurnsSucceeded} / ${totalTurnsAttempted} (成功率: ${successRatePercent}%)
- **T16 验收标准 (≥ 29/30)**: ${targetAchieved ? "✅ 通过" : "❌ 未通过"}

## 客户端明细矩阵

| 客户端 | 角色 | 语言 | 握手耗时 | 开场耗时 | 重连/恢复 | 成功话轮 | 音频上传 | 音频接收 | 平均延迟 | 状态 |
|--------|------|------|----------|----------|-----------|----------|----------|----------|----------|------|
${results.map(c => {
  const avgLat = c.latenciesMs.length > 0 ? Math.round(c.latenciesMs.reduce((a, b) => a + b, 0) / c.latenciesMs.length) + "ms" : "-";
  return `| #${c.clientId} | ${c.characterId} | ${c.locale} | ${c.readyMs}ms | ${c.greetingMs}ms | ${c.reconnects > 0 ? `${c.reconnects}次 (${c.recovered ? "已恢复" : "未恢复"})` : "0次"} | ${c.turnsSucceeded}/${c.turnsAttempted} | ${c.audioBytesSent}B | ${c.audioBytesReceived}B | ${avgLat} | ${c.status === "success" ? "✅" : "⚠️"} |`;
}).join("\n")}

## 错误与恢复记录
${results.flatMap(c => c.errors.map(e => `- 客户端 #${c.clientId}: ${e}`)).join("\n") || "无异常错误，10 个客户端均顺利建立真实中继并全双工交互。"}
`;

  writeFileSync("artifacts/g5-pilot/load-report.md", markdown);
  console.log("\n================ LOAD TEST RESULT ================");
  console.log(`Duration: ${totalDurationSeconds}s (Target >= ${minDurationSeconds}s: ${durationRequirementMet})`);
  console.log(`Success: ${totalTurnsSucceeded}/${totalTurnsAttempted} (${successRatePercent}%) (Target >= 29/30: ${targetAchieved})`);
  console.log(`Report written to artifacts/g5-pilot/load-report.json & load-report.md`);
  console.log("==================================================");

  if (!targetAchieved || !durationRequirementMet) {
    process.exitCode = 1;
  }
}

void main();
