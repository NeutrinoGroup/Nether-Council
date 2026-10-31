import { expect, test, type WebSocketRoute } from "@playwright/test";
import { mkdirSync } from "node:fs";
const id = "11111111-1111-4111-8111-111111111111";
test("missing invitation keeps paid voice entry closed", async ({ page }, info) => {
  await page.goto("/play?lang=en");
  await expect.poll(() => page.locator(".character-stage").getAttribute("data-triangles").then(Number), { timeout: 20000 }).toBeGreaterThan(29000);
  await expect(page.getByRole("button", { name: "Turn on mic & meet Meng Po" })).toBeDisabled();
  await expect(page.getByText("You need an event invitation.", { exact: false })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(".impeccable/review", { recursive: true });
  await page.screenshot({ path: `.impeccable/review/${info.project.name}.png`, fullPage: true });
});
test("worklet uploads during playback; interruption, mute, isolation and stop work", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  let socket: WebSocketRoute | undefined; let sentSeq = 0;
  const messages: Record<string, unknown>[] = [];
  const now = Date.now();
  const session = { id, characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  const send = (payload: object) => socket!.send(JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: sentSeq++, ...payload }));
  await page.route("**/api/sessions", route => route.fulfill({ json: { session } }));
  await page.route("**/api/events", route => route.fulfill({ status: 202 }));
  await page.routeWebSocket("**/api/ws", ws => {
    socket = ws;
    ws.onMessage(raw => {
      const event = JSON.parse(String(raw)); messages.push(event);
      if (event.type === "session.start") send({ type: "session.ready", session });
    });
  });
  await page.goto("/?invite=test-fixture&lang=en");
  await expect(page).toHaveURL(/\/play\?.*invite=test-fixture/);
  await expect.poll(() => page.locator(".character-stage").getAttribute("data-triangles").then(Number), { timeout: 20000 }).toBeGreaterThan(29000);
  await page.getByRole("button", { name: "Turn on mic & meet Meng Po" }).click();
  await expect.poll(() => messages.filter(e => e.type === "audio.append").length).toBeGreaterThan(3);
  const pcm = Buffer.alloc(24000 * 2 * 6);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 15) * 3000), i * 2);
  for (let offset = 0; offset < pcm.length; offset += 24000) send({ type: "audio.delta", responseId: "response-a", audio: pcm.subarray(offset, offset + 24000).toString("base64") });
  send({ type: "caption", caption: { sessionId: id, epoch: 0, responseId: "response-a", segmentId: "response-a", revision: 1, sourceLocale: "en", sourceText: "Five meetings and a deadline mix-up? Tell me which meeting could have been a pumpkin soup break.", speaker: "character", final: false } });
  await expect(page.getByText("Meng Po is speaking", { exact: true })).toBeVisible();
  await expect.poll(() => page.locator(".character-stage").getAttribute("data-mouth-level").then(Number)).toBeGreaterThan(0);
  const previous = messages.filter(e => e.type === "audio.append").length;
  await expect.poll(() => messages.filter(e => e.type === "audio.append").length).toBeGreaterThan(previous + 5);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `.impeccable/review/${info.project.name}-live.png`, fullPage: true });
  await page.getByRole("button", { name: "Interrupt Meng Po", exact: true }).click();
  await expect.poll(() => messages.some(e => e.type === "response.cancel")).toBe(true);
  await expect.poll(() => page.locator(".character-stage").getAttribute("data-mouth-level").then(Number)).toBe(0);
  // In-flight old audio cannot restart playback after the user interrupted.
  send({ type: "audio.delta", responseId: "response-a", audio: "AAA=" });
  await expect(page.getByRole("button", { name: "Interrupt Meng Po", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Mute microphone", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unmute microphone", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Drain the already sent WS frames, then explicit mute must stop uploading, not send fake silence.
  await page.waitForTimeout(200);
  const mutedCount = messages.filter(e => e.type === "audio.append").length;
  await page.waitForTimeout(450);
  expect(messages.filter(e => e.type === "audio.append")).toHaveLength(mutedCount);
  await page.getByRole("button", { name: "Unmute microphone", exact: true }).click();
  await expect.poll(() => messages.filter(e => e.type === "audio.append").length).toBeGreaterThan(mutedCount);
  send({ type: "audio.delta", responseId: "response-b", audio: Buffer.alloc(19200).toString("base64") });
  await expect(page.getByText("Meng Po is speaking", { exact: true })).toBeVisible();
  await expect(page.getByText("Listening to you", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Interrupt Meng Po", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "End conversation", exact: true }).click();
  await expect(page.getByText("Conversation ended", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Chinese entry shows its character and has no horizontal overflow", async ({ page }, info) => {
  await page.goto("/play?invite=test-fixture&lang=zh");
  await expect.poll(() => page.locator(".character-stage").getAttribute("data-triangles").then(Number), { timeout: 20000 }).toBeGreaterThan(29000);
  await expect(page.getByRole("heading", { name: "孟婆", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开麦，找孟婆聊聊" })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `.impeccable/review/${info.project.name}-zh.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("model failure names the downgrade and keeps the voice entry available", async ({ page }) => {
  await page.route("**/models/meng-po.glb", route => route.fulfill({ status: 503, body: "Asset unavailable" }));
  await page.goto("/play?invite=test-fixture&lang=en");
  await expect(page.getByText("3D is unavailable. Voice still works.", { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "Turn on mic & meet Meng Po" })).toBeEnabled();
});

test("retryable upstream failure survives a normal close and reconnects", async ({ page }) => {
  const now = Date.now(); let connections = 0;
  const session = { id, characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  await page.route("**/api/sessions", route => route.fulfill({ json: { session } }));
  await page.route("**/api/events", route => route.fulfill({ status: 202 }));
  await page.routeWebSocket("**/api/ws", ws => {
    connections++; const attempt = connections;
    ws.onMessage(raw => {
      const event = JSON.parse(String(raw));
      if (event.type !== "session.start") return;
      const envelope = { protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: event.epoch, seq: 0 };
      if (attempt === 1) {
        ws.send(JSON.stringify({ ...envelope, type: "error", error: { code: "UPSTREAM_UNAVAILABLE", retryable: true, message: { zh: "稍后重试", en: "Retry shortly" } } }));
        ws.close({ code: 1000, reason: "Close raced the retryable error" });
      } else ws.send(JSON.stringify({ ...envelope, type: "session.ready", session }));
    });
  });
  await page.goto("/play?invite=test-fixture&lang=en");
  await page.getByRole("button", { name: "Turn on mic & meet Meng Po" }).click();
  await expect(page.getByText("Listening to you", { exact: true })).toBeVisible({ timeout: 10000 });
  expect(connections).toBe(2);
  await page.getByRole("button", { name: "End conversation", exact: true }).click();
  await expect(page.getByText("Conversation ended", { exact: true })).toBeVisible();
});

test("two story turns enable ending; asynchronous bilingual captions preserve live audio", async ({ page }, info) => {
  const now = Date.now(); let socket: WebSocketRoute; let seq = 0; const messages: Record<string, unknown>[] = [];
  const session = { id, characterId: "meng-po", locale: "zh", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  const send = (event: object) => socket.send(JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: seq++, ...event }));
  await page.route("**/api/sessions", route => route.fulfill({ json: { session } }));
  await page.route("**/api/events", route => route.fulfill({ status: 202 }));
  await page.routeWebSocket("**/api/ws", ws => { socket = ws; ws.onMessage(raw => { const event = JSON.parse(String(raw)); messages.push(event); if (event.type === "session.start") send({ type: "session.ready", session }); }); });
  await page.goto("/play?invite=fixture&lang=zh");
  await expect.poll(() => page.locator(".character-stage").getAttribute("data-triangles").then(Number), { timeout: 20000 }).toBeGreaterThan(29000);
  await page.getByLabel("怎么称呼你？（选填）").fill("南瓜 Alex");
  await page.getByRole("button", { name: "开麦，找孟婆聊聊" }).click();
  await expect.poll(() => messages.filter(e => e.type === "audio.append").length).toBeGreaterThan(2);
  const source = { sessionId: id, epoch: 0, responseId: "u1", segmentId: "u1", revision: 1, sourceLocale: "zh", sourceText: "今天开了五场会，工作一点没动。", speaker: "user", final: true };
  send({ type: "caption", caption: source });
  send({ type: "caption", caption: { ...source, responseId: "u2", segmentId: "u2", sourceText: "最后一场会开到了半夜。" } });
  const character = { ...source, speaker: "character", responseId: "reply", segmentId: "reply", sourceText: "五场会熬成一碗南瓜汤，半夜那场负责加班添火。今晚先把会议纪要放下吧。" };
  send({ type: "response.started", responseId: "reply" });
  send({ type: "caption", caption: character });
  const pcm = Buffer.alloc(24000 * 2 * 4);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 15) * 3000), i * 2);
  for (let offset = 0; offset < pcm.length; offset += 24000) send({ type: "audio.delta", responseId: "reply", audio: pcm.subarray(offset, offset + 24000).toString("base64") });
  await expect(page.locator(".translated-caption").filter({ hasText: "正在翻译…" }).first()).toBeVisible();
  await expect.poll(() => page.locator(".character-stage").getAttribute("data-mouth-level").then(Number)).toBeGreaterThan(0);
  send({ type: "caption.translation", translation: { ...character, status: "ready", translatedText: "Five meetings simmered into pumpkin soup. The midnight meeting kept the fire going. Put down those meeting notes for tonight." } });
  send({ type: "caption.translation", translation: { ...source, responseId: "u2", segmentId: "u2", sourceText: "最后一场会开到了半夜。", status: "unavailable" } });
  await expect(page.getByText("Five meetings simmered", { exact: false })).toBeVisible();
  await expect(page.locator(".translated-caption").filter({ hasText: "译文暂不可用，原文仍可阅读。" })).toBeVisible();
  await expect(page.getByText("这段奇遇，可以收好了。", { exact: false })).toBeVisible();
  const claim = page.getByRole("button", { name: "收好故事", exact: true }); await expect(claim).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === "mobile") { const rect = await claim.boundingBox(); expect(rect!.y + rect!.height).toBeLessThanOrEqual(info.project.use.viewport!.height); }
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `.impeccable/review/${info.project.name}-encounter.png`, fullPage: true });
  if (info.project.name === "mobile") {
    await page.locator(".encounter-progress").scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".impeccable/review/mobile-encounter-detail.png", fullPage: true });
  }
  await claim.click(); await expect(page.getByText("南瓜 Alex，故事已收好。", { exact: true })).toBeVisible();
  await expect(page.getByText("故事仅保留在本页。", { exact: false })).toBeVisible();
  expect(messages.some(e => e.type === "session.end")).toBe(true);
});

test("language switch ends the current conversation and waits for a fresh start gesture", async ({ page }) => {
  let admissions = 0; const messages: Record<string, unknown>[] = [];
  await page.route("**/api/sessions", route => { admissions++; const now = Date.now(); return route.fulfill({ json: { session: { id, characterId: "meng-po", locale: "zh", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 } } }); });
  await page.route("**/api/events", route => route.fulfill({ status: 202 }));
  await page.routeWebSocket("**/api/ws", ws => { ws.onMessage(raw => messages.push(JSON.parse(String(raw)))); });
  await page.goto("/play?invite=fixture&lang=zh");
  await page.getByRole("button", { name: "开麦，找孟婆聊聊" }).click();
  await expect.poll(() => messages.some(e => e.type === "session.start")).toBe(true);
  await page.getByRole("button", { name: "结束当前对话并切换为英语" }).click();
  await expect(page.getByRole("heading", { name: "Meng Po", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on mic & meet Meng Po" })).toBeEnabled();
  expect(messages.some(e => e.type === "session.end")).toBe(true); expect(admissions).toBe(1);
  const captured = messages.filter(e => e.type === "audio.append").length;
  await page.waitForTimeout(300); expect(messages.filter(e => e.type === "audio.append")).toHaveLength(captured);
  const examples = page.locator(infoMobile(page) ? ".mobile-opening-lines li" : ".story-examples li"); expect(await examples.count()).toBe(3);
});

test("switching character updates character heading, starters, and button cleanly", async ({ page }) => {
  await page.goto("/play?invite=test-fixture&lang=zh");
  await expect(page.getByRole("heading", { name: "孟婆", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开麦，找孟婆聊聊" })).toBeEnabled();

  await page.getByRole("radio", { name: "黑无常" }).click();
  await expect(page.getByRole("heading", { name: "黑无常", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开麦，找黑无常聊聊" })).toBeEnabled();

  await page.getByRole("radio", { name: "怪人弗兰肯斯坦" }).click();
  await expect(page.getByRole("heading", { name: "怪人弗兰肯斯坦", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开麦，找怪人弗兰肯斯坦聊聊" })).toBeEnabled();
});

function infoMobile(page: import("@playwright/test").Page) { return (page.viewportSize()?.width ?? 1440) <= 640; }
