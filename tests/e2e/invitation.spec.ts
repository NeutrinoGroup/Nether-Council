import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { Session } from "@nether/contracts";
import { readSession, signTicket } from "../../apps/web/src/shared/server/tickets";

// All HTTP routes are real. Only the voice socket is a deterministic protocol
// fixture; these checks do not certify human speech or a real Qwen response.
const campaignId = "invitation-e2e-fixture";
const campaignSecret = "invitation-campaign-fixture-secret-32-characters";
const sessionSecret = "invitation-session-fixture-secret-32-characters";
const invite = () => {
  const now = Date.now();
  return signTicket({ kind: "campaign", campaignId, issuedAt: now, expiresAt: now + 900_000 }, campaignSecret);
};
const entry = (ticket: string) => `/play?${new URLSearchParams({ invite: ticket, character: "meng-po", lang: "zh" })}`;

async function loginAndReadQr(page: Page, ticket: string, visitorId: string) {
  await page.addInitScript(id => localStorage.setItem("nc_visitor_id", id), visitorId);
  await page.goto(entry(ticket));
  const login = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/google/exchange");
  await page.getByRole("button", { name: "体验登录", exact: true }).click();
  expect((await login).status()).toBe(200);
  await expect(page.getByRole("button", { name: "分享 / 二维码", exact: true })).toBeVisible();
  const shared = page.waitForResponse(response => new URL(response.url()).pathname === "/api/referrals");
  await page.getByRole("button", { name: "分享 / 二维码", exact: true }).click();
  const response = await shared;
  expect(response.status()).toBe(200);
  const { shareUrl } = await response.json();
  const image = page.getByAltText("Halloween Share QR Code", { exact: true });
  await expect(image).toBeVisible();
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve("jsqr") });
  const decoded = await image.evaluate(async element => {
    const image = element as HTMLImageElement;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const decode = (window as unknown as { jsQR: (pixels: Uint8ClampedArray, width: number, height: number) => { data: string } | null }).jsQR;
    return decode(pixels.data, pixels.width, pixels.height)?.data ?? null;
  });
  expect(decoded).toBe(shareUrl);
  expect(decoded).not.toBeNull();
  return new URL(decoded!);
}

async function admitFriend(browser: Browser, shareUrl: URL, visitorId: string, info: TestInfo, sourceSessionId?: string) {
  const context = await browser.newContext({
    baseURL: shareUrl.origin, permissions: ["microphone"], reducedMotion: "reduce",
    viewport: info.project.use.viewport, isMobile: info.project.use.isMobile, hasTouch: info.project.use.hasTouch,
  });
  try {
    await context.addInitScript(id => {
      localStorage.setItem("nc_visitor_id", id);
      const Original = window.AudioContext;
      window.AudioContext = class extends Original {
        constructor(options?: AudioContextOptions) {
          super({ ...options, sinkId: { type: "none" } } as AudioContextOptions);
        }
      };
    }, visitorId);
    const page = await context.newPage();
    const admitted = page.waitForResponse(response => new URL(response.url()).pathname === "/api/sessions");
    const sessionReady = admitted.then(async response => {
      expect(response.status()).toBe(200);
      expect(response.request().postDataJSON().visitorId).toBe(visitorId);
      return Session.parse((await response.json()).session);
    });
    await page.routeWebSocket("**/api/ws", socket => {
      let seq = 0;
      socket.onMessage(async raw => {
        const event = JSON.parse(String(raw));
        if (event.type !== "session.start" && event.type !== "ping") return;
        const session = await sessionReady;
        const send = (payload: object) => socket.send(JSON.stringify({
          protocolVersion: 1, eventId: randomUUID(), sessionId: session.id,
          epoch: event.epoch, seq: seq++, ...payload,
        }));
        if (event.type === "ping") { send({ type: "pong" }); return; }
        send({ type: "session.ready", session });
        send({ type: "caption", caption: {
          sessionId: session.id, epoch: event.epoch, responseId: "fixture-story", segmentId: "fixture-story",
          revision: 1, sourceLocale: "zh", sourceText: "今天开了五场会议，最后一场开到半夜。", speaker: "user", final: true,
        } });
      });
    });
    await page.goto(shareUrl.href);
    await expect(page.getByRole("button", { name: "Google 登录", exact: true })).toBeVisible();
    expect((await context.cookies()).some(cookie => cookie.name === "nc_identity")).toBe(false);
    const started = page.waitForResponse(response => new URL(response.url()).pathname === "/api/events" && response.request().postDataJSON()?.name === "conversation_started");
    await page.getByRole("button", { name: "开麦，找孟婆聊聊", exact: true }).click();
    const session = await sessionReady;
    const eventResponse = await started;
    expect(eventResponse.status()).toBe(202);
    expect(eventResponse.request().postDataJSON().sessionId).toBe(session.id);
    const cookie = (await context.cookies()).find(item => item.name === "nc_session");
    expect(cookie).toBeDefined();
    const claims = readSession(cookie!.value, sessionSecret);
    expect(claims?.session.id).toBe(session.id);
    expect(claims?.visitorId).toBe(visitorId);
    expect(claims?.campaign.campaignId).toBe(campaignId);
    expect(claims?.sourceSessionId).toBe(sourceSessionId);
    expect((await context.cookies()).some(item => item.name === "nc_identity")).toBe(false);
  } finally {
    await context.close();
  }
}

test("an existing campaign QR admits a separate anonymous browser without inventing a referral", async ({ page, browser, baseURL }, info) => {
  const ticket = invite();
  const sourceVisitor = randomUUID();
  const friendVisitor = randomUUID();
  const shareUrl = await loginAndReadQr(page, ticket, sourceVisitor);
  expect(shareUrl.origin).toBe(baseURL);
  expect(shareUrl.searchParams.get("invite")).toBe(ticket);
  expect(shareUrl.searchParams.has("ref")).toBe(false);
  expect(friendVisitor).not.toBe(sourceVisitor);
  await admitFriend(browser, shareUrl, friendVisitor, info);
});

test("a session QR preserves signed source attribution when a separate browser starts a story", async ({ page, context, browser, baseURL }, info) => {
  const ticket = invite();
  const sourceVisitor = randomUUID();
  const friendVisitor = randomUUID();
  const admitted = await context.request.post(`${baseURL}/api/sessions`, {
    headers: { Origin: baseURL! },
    data: { invite: ticket, characterId: "meng-po", locale: "zh", visitorId: sourceVisitor },
  });
  expect(admitted.status()).toBe(200);
  const source = Session.parse((await admitted.json()).session);
  const sourceCookie = (await context.cookies()).find(cookie => cookie.name === "nc_session");
  expect(readSession(sourceCookie!.value, sessionSecret)?.visitorId).toBe(sourceVisitor);
  const shareUrl = await loginAndReadQr(page, ticket, sourceVisitor);
  expect(shareUrl.origin).toBe(baseURL);
  expect(shareUrl.searchParams.get("ref")).toBeTruthy();
  expect(friendVisitor).not.toBe(sourceVisitor);
  await admitFriend(browser, shareUrl, friendVisitor, info, source.id);
});
