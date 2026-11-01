import { expect, test, type WebSocketRoute } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { readCardQr } from "../../scripts/lib/read-card-qr";

const id = "44444444-4444-4444-8444-444444444444";

test("encounter wrap-up reveals schema-valid identity card with PNG download and sharing", async ({ page }, info) => {
  test.setTimeout(45000);
  let socket: WebSocketRoute | undefined;
  let sentSeq = 0;
  const messages: Record<string, unknown>[] = [];
  let httpRecoveries = 0;
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
  await page.route("**/api/verdict", route => { httpRecoveries++; return route.fulfill({ json: { result: mockResult } }); });
  await page.addInitScript(() => {
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await capture(constraints);
      Object.assign(window, { trialTracks: stream.getTracks() });
      return stream;
    };
  });

  await page.routeWebSocket("**/api/ws", ws => {
    socket = ws;
    ws.onMessage(raw => {
      const event = JSON.parse(String(raw));
      messages.push(event);
      if (event.type === "ping") {
        socket?.send(
          JSON.stringify({
            protocolVersion: 1,
            eventId: crypto.randomUUID(),
            sessionId: id,
            epoch: 0,
            seq: sentSeq++,
            type: "pong",
          })
        );
      }
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
        setTimeout(() => {
          const send = (payload: object) => socket?.send(JSON.stringify({
            protocolVersion: 1,
            eventId: crypto.randomUUID(),
            sessionId: id,
            epoch: 0,
            seq: sentSeq++,
            ...payload,
          }));
          send({ type: "result", result: mockResult });
          send({ type: "response.started", responseId: "farewell" });
          for (let i = 0; i < 4; i++) send({ type: "audio.delta", responseId: "farewell", audio: Buffer.alloc(24000).toString("base64") });
          send({ type: "response.done", responseId: "farewell" });
        }, 1200);
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
  expect(messages.some(e => e.type === "session.end")).toBe(false);
  await expect.poll(() => page.evaluate(() => (window as unknown as { trialTracks: MediaStreamTrack[] }).trialTracks.every(track => track.readyState === "ended"))).toBe(true);

  // Verify IdentityCard is displayed
  const cardSection = page.locator(".identity-card-section");
  await expect(cardSection).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("对话已结束", { exact: true })).toBeVisible({ timeout: 15000 });
  expect(httpRecoveries).toBe(0);

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
  await expect.poll(() => readCardQr(page)).toBe("http://localhost:3000/play?invite=mock-invite&ref=mock-ref-token&character=meng-po&lang=zh");

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

test("late HTTP recovery cannot attach an old identity after a character change", async ({ page }) => {
  let socket: WebSocketRoute | undefined;
  let pending: import("@playwright/test").Route | undefined;
  let seq = 0;
  const now = Date.now();
  const session = { id, characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  const send = (payload: object) => socket!.send(JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: seq++, ...payload }));
  await page.route("**/api/sessions", route => route.fulfill({ json: { session } }));
  await page.route("**/api/events", route => route.fulfill({ status: 202 }));
  await page.route("**/api/verdict", route => { pending = route; });
  await page.routeWebSocket("**/api/ws", ws => {
    socket = ws;
    ws.onMessage(raw => {
      const event = JSON.parse(String(raw));
      if (event.type === "session.start") send({ type: "session.ready", session });
      if (event.type === "ping") send({ type: "pong" });
    });
  });
  await page.goto("/play?invite=test-fixture&lang=en");
  await page.getByRole("button", { name: "Turn on mic & meet Meng Po" }).click();
  await expect(page.getByText("Listening to you", { exact: true })).toBeVisible();
  send({ type: "caption", caption: { sessionId: id, epoch: 0, responseId: "u1", segmentId: "u1", revision: 1, sourceLocale: "en", sourceText: "My boss scheduled five meetings after midnight.", speaker: "user", final: true } });
  await expect(page.getByRole("button", { name: "Keep my story" })).toBeVisible();
  await page.getByRole("button", { name: "End conversation", exact: true }).click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page.getByRole("radio", { name: "Hei Wuchang", exact: true }).check();
  await pending!.fulfill({ json: { result: { id: crypto.randomUUID(), sessionId: id, characterId: "meng-po", generatedAt: now, fallback: false, title: { zh: "旧故事身份", en: "Old Story Identity" }, verdict: { zh: "把夜会留给南瓜汤。", en: "Leave that late meeting in the soup." }, warmClosing: { zh: "晚安。", en: "Rest well." }, tags: [{ zh: "安睡", en: "Rest" }, { zh: "散场", en: "Adjourned" }], sourceTurnIds: ["u1"] } } }).catch(() => {});
  await expect(page.getByRole("heading", { name: "Hei Wuchang", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on mic & meet Hei Wuchang" })).toBeEnabled();
  await expect(page.locator(".identity-card-section")).toHaveCount(0);
  await expect(page.locator(".error-note[role=alert]")).toHaveCount(0);
});
