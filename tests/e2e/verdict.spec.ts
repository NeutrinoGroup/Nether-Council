import { expect, test, type WebSocketRoute } from "@playwright/test";
import { mkdirSync } from "node:fs";

const id = "44444444-4444-4444-8444-444444444444";

test("encounter wrap-up reveals schema-valid identity card with PNG download and sharing", async ({ page }, info) => {
  let socket: WebSocketRoute | undefined;
  let sentSeq = 0;
  const messages: Record<string, unknown>[] = [];
  const now = Date.now();
  const session = {
    id,
    characterId: "meng-po",
    locale: "zh",
    mode: "personal",
    createdAt: now,
    captureUntil: now + 180_000,
    expiresAt: now + 235_000,
  };

  const mockResult = {
    id: "55555555-5555-4555-8555-555555555555",
    sessionId: id,
    characterId: "meng-po",
    generatedAt: now,
    fallback: false,
    title: { zh: "黄泉散会专员", en: "Meeting Adjourner" },
    verdict: {
      zh: "五场会议无一落地，南瓜汤里捞出的尽是未确认的日程。",
      en: "Five meetings without a resolution; soup full of calendar invites.",
    },
    warmClosing: {
      zh: "喝了这碗汤，散掉无用会。今晚早点睡。",
      en: "Drink this soup and leave the pointless meetings behind.",
    },
    tags: [
      { zh: "静音大师", en: "Mute Master" },
      { zh: "会议逃兵", en: "Meeting Dodger" },
    ],
    sourceTurnIds: ["u1"],
  };

  await page.route("**/api/sessions", route => route.fulfill({ json: { session } }));
  await page.route("**/api/events", route => route.fulfill({ status: 202 }));
  await page.route("**/api/referrals", route =>
    route.fulfill({
      json: {
        referral: "mock-ref-token",
        shareUrl: "http://localhost:3000/play?invite=mock-invite&ref=mock-ref-token&character=meng-po&lang=zh",
      },
    })
  );
  await page.route("**/api/verdict", route => route.fulfill({ json: { result: mockResult } }));

  await page.routeWebSocket("**/api/ws", ws => {
    socket = ws;
    ws.onMessage(raw => {
      const event = JSON.parse(String(raw));
      messages.push(event);
      if (event.type === "session.start") {
        socket?.send(
          JSON.stringify({
            protocolVersion: 1,
            eventId: crypto.randomUUID(),
            sessionId: id,
            epoch: 0,
            seq: sentSeq++,
            type: "session.ready",
            session,
          })
        );
      }
      if (event.type === "session.finalize") {
        socket?.send(
          JSON.stringify({
            protocolVersion: 1,
            eventId: crypto.randomUUID(),
            sessionId: id,
            epoch: 0,
            seq: sentSeq++,
            type: "result",
            result: mockResult,
          })
        );
      }
    });
  });

  await page.goto("/play?invite=test-fixture&lang=zh");
  await expect(page.getByRole("button", { name: "开麦，找孟婆聊聊" })).toBeVisible();

  // Enter custom nickname before starting
  const nameInput = page.locator("#nickname");
  await nameInput.fill("夜巡小道友");
  await nameInput.blur();

  await page.getByRole("button", { name: "开麦，找孟婆聊聊" }).click();
  await expect.poll(() => messages.some(e => e.type === "session.start")).toBe(true);

  // Send confirmed user story turn
  socket?.send(
    JSON.stringify({
      protocolVersion: 1,
      eventId: crypto.randomUUID(),
      sessionId: id,
      epoch: 0,
      seq: sentSeq++,
      type: "caption",
      caption: {
        sessionId: id,
        epoch: 0,
        responseId: "u1",
        segmentId: "u1",
        revision: 1,
        sourceLocale: "zh",
        sourceText: "今天开了五场跨部门会议，需求一个字都没定下来。",
        speaker: "user",
        final: true,
      },
    })
  );

  // Claim button becomes visible and clickable
  const claimBtn = page.getByRole("button", { name: "收好故事" });
  await expect(claimBtn).toBeVisible();
  await claimBtn.click();

  // Verify session.finalize was sent
  await expect.poll(() => messages.some(e => e.type === "session.finalize")).toBe(true);

  // Verify IdentityCard is displayed
  const cardSection = page.locator(".identity-card-section");
  await expect(cardSection).toBeVisible();

  // Check card controls and interactions
  await expect(page.getByRole("button", { name: "下载身份卡 PNG" })).toBeVisible();
  await expect(page.getByRole("button", { name: "复制分享文案" })).toBeVisible();
  await expect(page.getByRole("button", { name: "复制邀请链接" })).toBeVisible();

  // Test toggling verdict visibility
  const hideCheckbox = page.getByLabel("在分享卡上隐去我的具体经历评价");
  await expect(hideCheckbox).toBeVisible();
  await hideCheckbox.check();

  // Test editing nickname on card
  const cardNicknameInput = page.locator("#card-nickname-input");
  await cardNicknameInput.fill("摸鱼仙尊");
  await cardNicknameInput.blur();

  // Test copy share text
  await page.getByRole("button", { name: "复制分享文案" }).click();
  await expect(page.getByRole("button", { name: /文案已复制|复制分享文案/ })).toBeVisible();

  // Test download click
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载身份卡 PNG" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`nether-identity-${id.slice(0, 8)}.png`);

  await page.evaluate(() => document.fonts.ready);
  mkdirSync(".impeccable/review", { recursive: true });
  await page.screenshot({ path: `.impeccable/review/${info.project.name}-verdict-card.png`, fullPage: true });
});
