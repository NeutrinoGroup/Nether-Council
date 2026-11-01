/** Opt-in, billable real-provider check. Synthetic microphone, never human acceptance. */
import { chromium, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { IdentityResult } from "@nether/contracts";
import { signTicket } from "../apps/web/src/shared/server/tickets";
import { loadLocalEnv } from "./lib/env";
import { readCardQr } from "./lib/read-card-qr";

loadLocalEnv();
const flag = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
if (!process.argv.includes("--real-provider") || !flag("--url")) throw new Error("Opt in with --real-provider --url https://<Nether preview>");
const origin = new URL(flag("--url")!).origin;
if (!/^https:\/\/nether-council(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin)) throw new Error("Use this project's HTTPS Vercel hostname");
if ((process.env.CAMPAIGN_SIGNING_SECRET?.length ?? 0) < 32) throw new Error("Campaign signing secret is missing");
const selected = flag("--locale");
if (selected && selected !== "zh" && selected !== "en") throw new Error("Choose zh or en");
const browser = await chromium.launch({ headless: true, ...(existsSync("/Applications/Google Chrome.app") ? { channel: "chrome" } : {}) });
const reports: Record<string, unknown>[] = [];
let failed = false;
try {
  for (const locale of selected ? [selected] : ["en", "zh"]) {
    const mobile = locale === "zh" && process.argv.includes("--mobile-soak");
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, reducedMotion: "reduce", acceptDownloads: true, permissions: ["microphone"], ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    const cookieFile = flag("--cookies");
    if (cookieFile) {
      const cookies = readFileSync(cookieFile, "utf8").split("\n").filter(line => line.trim() && (!line.startsWith("#") || line.startsWith("#HttpOnly_"))).map(line => {
        const [domain, , path, secure, expires, name, value] = line.replace(/^#HttpOnly_/, "").split("\t");
        return { domain, path, secure: secure === "TRUE", ...(Number(expires) > 0 ? { expires: Number(expires) } : {}), name, value, httpOnly: line.startsWith("#HttpOnly_") };
      });
      await context.addCookies(cookies);
    }
    await context.addInitScript(() => {
      // A controllable synthetic MediaStream passes through the REAL capture Worklet.
      // No personal microphone or story is captured by this test.
      let input: AudioContext | undefined;
      let destination: MediaStreamAudioDestinationNode | undefined;
      navigator.mediaDevices.getUserMedia = async () => {
        input = new AudioContext({ sampleRate: 16000 });
        destination = input.createMediaStreamDestination();
        await input.resume();
        return destination.stream;
      };
      Object.assign(window, { feedFixture: async (base64: string) => {
        if (!input || !destination) throw new Error("Synthetic stream is not ready");
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const view = new DataView(bytes.buffer);
        const buffer = input.createBuffer(1, bytes.length / 2, 16000);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < channel.length; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
        const source = input.createBufferSource(); source.buffer = buffer;
        source.connect(destination); source.start();
      } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const startedAt = Date.now();
    const report: Record<string, unknown> = { at: new Date().toISOString(), origin, locale, browser: browser.version(), platform: process.platform, viewport: mobile ? "390x844 on Mac; NOT a physical phone" : "1440x1000", kind: "real_qwen_real_worklet_synthetic_media_stream_not_human_acceptance" };
    let upload = 0, audio = 0, vad = 0, done = 0, userTurns = 0, characterTurns = 0, translationsReady = 0;
    let resultValid = false, resultFallback: boolean | undefined;
    let uploadDuringPlayback = 0;
    let lastAudioAt = 0;
    let referralUrl: string | undefined;
    const codes: string[] = [];
    const users = new Set<string>();
    page.on("websocket", socket => {
      socket.on("framesent", ({ payload }) => {
        try { const event = JSON.parse(String(payload)); if (event.type === "audio.append") { upload++; if (Date.now() - lastAudioAt < 250) uploadDuringPlayback++; } } catch {}
      });
      socket.on("framereceived", ({ payload }) => {
        try {
          const event = JSON.parse(String(payload));
          if (event.type === "audio.delta") { audio++; lastAudioAt = Date.now(); }
          if (event.type === "speech.started") vad++;
          if (event.type === "response.done") done++;
          if (event.type === "caption.translation" && event.translation.status === "ready") translationsReady++;
          if (event.type === "error") codes.push(String(event.error?.code));
          if (event.type === "caption" && event.caption.final) {
            if (event.caption.speaker === "user") { users.add(event.caption.segmentId); userTurns = users.size; }
            else characterTurns++;
          }
          if (event.type === "result") { resultValid = IdentityResult.safeParse(event.result).success; resultFallback = event.result.fallback; }
        } catch {}
      });
    });
    page.on("response", async response => {
      if (new URL(response.url()).pathname === "/api/referrals" && response.ok()) {
        try { referralUrl = (await response.json()).shareUrl; } catch {}
      }
    });
    try {
      const now = Date.now();
      const invite = signTicket({ kind: "campaign", campaignId: process.env.NEXT_PUBLIC_CAMPAIGN_ID ?? "halloween-2026", issuedAt: now, expiresAt: now + 900000 }, process.env.CAMPAIGN_SIGNING_SECRET!);
      await page.goto(`${origin}/?lang=${locale}&invite=${invite}`);
      await page.getByRole("link", { name: locale === "zh" ? "推门，遇见孟婆" : "Step inside. Meet Meng Po" }).click();
      await expect.poll(() => page.locator(".character-stage").getAttribute("data-triangles").then(Number), { timeout: 30000 }).toBeGreaterThan(29000);
      await page.getByRole("button", { name: locale === "zh" ? "开麦，找孟婆聊聊" : "Turn on mic & meet Meng Po" }).click();
      await expect.poll(() => audio, { timeout: 45000 }).toBeGreaterThan(2);
      await expect.poll(() => page.locator(".character-stage").getAttribute("data-mouth-level").then(Number), { timeout: 15000, intervals: [50, 100] }).toBeGreaterThan(0);
      const playbackAtFirstInput = true;
      report.playbackAtFirstInput = playbackAtFirstInput;
      for (let i = 1; i <= 3; i++) {
        const before = done; const beforeCharacters = characterTurns;
        const pcm = readFileSync(`tests/fixtures/audio/${locale}_turn${i}.pcm`).toString("base64");
        await page.evaluate(async data => { await (window as unknown as { feedFixture: (audio: string) => Promise<void> }).feedFixture(data); }, pcm);
        await expect.poll(() => userTurns, { timeout: 45000 }).toBeGreaterThanOrEqual(i);
        await expect.poll(() => done > before && characterTurns > beforeCharacters, { timeout: 45000 }).toBe(true);
      }
      await page.getByRole("button", { name: locale === "zh" ? "收好故事" : "Keep my story" }).click();
      await expect(page.locator(".identity-card-section")).toBeVisible({ timeout: 30000 });
      await expect(page.getByText(locale === "zh" ? "对话已结束" : "Conversation ended", { exact: true })).toBeVisible({ timeout: 55000 });
      const downloadReady = page.waitForEvent("download");
      await page.getByRole("button", { name: locale === "zh" ? "下载身份卡 PNG" : "Download Card PNG" }).click();
      const download = await downloadReady;
      report.pngDownloaded = download.suggestedFilename().endsWith(".png");
      await expect.poll(() => Boolean(referralUrl)).toBe(true);
      const decodedQr = await readCardQr(page);
      expect(decodedQr).toBe(referralUrl);
      report.exportedQrDecoded = true;
      // Verify the signed QR handoff admission without opening another paid socket.
      const share = new URL(decodedQr!);
      const admission = await context.request.post(`${origin}/api/sessions`, { headers: { Origin: origin }, data: { characterId: "meng-po", locale, mode: "personal", invite: share.searchParams.get("invite"), ref: share.searchParams.get("ref") } });
      report.friendAdmissionStatus = admission.status();
      expect(admission.ok()).toBe(true);
      expect(resultValid).toBe(true); expect(vad).toBeGreaterThan(0); expect(uploadDuringPlayback).toBeGreaterThan(0);
      expect(translationsReady).toBeGreaterThan(0);
      if (mobile) {
        // Soak the mobile viewport for two minutes total, on this Mac only.
        while (Date.now() - startedAt < 120000) await page.waitForTimeout(Math.min(1000, 120000 - (Date.now() - startedAt)));
        report.soakSeconds = Math.floor((Date.now() - startedAt) / 1000);
        report.sceneFps = Number(await page.locator(".character-stage").getAttribute("data-fps"));
      }
      report.status = "passed";
    } catch (error) {
      failed = true; report.status = "failed"; report.errorType = error instanceof Error ? error.name : "unknown";
      report.visibleState = await page.locator(".live-state").innerText().catch(() => "unavailable");
    } finally {
      Object.assign(report, { uploadChunks: upload, audioChunks: audio, uploadDuringRecentAudio: uploadDuringPlayback, vadEvents: vad, userTurns, characterTurns, translationsReady, resultSchemaValid: resultValid, resultFallback, errorCodes: codes, elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000) });
      reports.push(report); console.log(JSON.stringify(report));
      await context.close();
    }
  }
} finally {
  await browser.close(); mkdirSync("artifacts/verification", { recursive: true });
  writeFileSync("artifacts/verification/real-encounter.json", JSON.stringify(reports, null, 2), { mode: 0o600 });
}
if (failed) process.exitCode = 1;
