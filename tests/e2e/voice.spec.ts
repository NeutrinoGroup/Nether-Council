import { expect, test, type WebSocketRoute } from "@playwright/test";
import { mkdirSync } from "node:fs";
const id = "11111111-1111-4111-8111-111111111111";
test("missing invitation keeps paid voice entry closed", async ({ page }, info) => {
  await page.goto("/play?lang=en");
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
  await page.getByRole("button", { name: "Turn on mic & meet Meng Po" }).click();
  await expect.poll(() => messages.filter(e => e.type === "audio.append").length).toBeGreaterThan(3);
  const pcm = Buffer.alloc(24000 * 2 * 3);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 15) * 3000), i * 2);
  for (let offset = 0; offset < pcm.length; offset += 24000) send({ type: "audio.delta", responseId: "response-a", audio: pcm.subarray(offset, offset + 24000).toString("base64") });
  send({ type: "caption", caption: { sessionId: id, epoch: 0, responseId: "response-a", segmentId: "response-a", revision: 1, sourceLocale: "en", sourceText: "Five meetings and a deadline mix-up? Tell me which meeting could have been a pumpkin soup break.", speaker: "character", final: false } });
  await expect(page.getByText("Meng Po is speaking", { exact: true })).toBeVisible();
  const previous = messages.filter(e => e.type === "audio.append").length;
  await expect.poll(() => messages.filter(e => e.type === "audio.append").length).toBeGreaterThan(previous + 5);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `.impeccable/review/${info.project.name}-live.png`, fullPage: true });
  await page.getByRole("button", { name: "Interrupt Meng Po", exact: true }).click();
  await expect.poll(() => messages.some(e => e.type === "response.cancel")).toBe(true);
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
  await expect(page.getByRole("heading", { name: "孟婆", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开麦，找孟婆聊聊" })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `.impeccable/review/${info.project.name}-zh.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
