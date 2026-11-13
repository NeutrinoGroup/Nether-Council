import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import { readCardQr } from "../../scripts/lib/read-card-qr";
import { ReferralClaims, readSession, signTicket, verifyTicket } from "../../apps/web/src/shared/server/tickets";

const campaignSecret = "invitation-campaign-fixture-secret-32-characters";
const sessionSecret = "invitation-session-fixture-secret-32-characters";
const referralSecret = "invitation-referral-fixture-secret-32-characters";

// The cached result and voice WS are fixtures. Admission, sharing, cookies and
// telemetry use real HTTP routes; this does not certify Qwen or human speech.
test("a card keeps its own source when another tab opens a session, and its QR admits a friend", async ({ page, context, baseURL }) => {
  const now = Date.now();
  const invite = signTicket({ kind: "campaign", campaignId: "invitation-e2e-fixture", issuedAt: now, expiresAt: now + 900_000 }, campaignSecret);
  let originalSessionId = "";
  let cardToken = "";
  let secondSessionId = "";
  let referralRequests = 0;
  await page.route("**/models/*.glb*", route => route.fulfill({ status: 503 }));
  await page.route("**/api/sessions", async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const { session, share } = await response.json();
    originalSessionId = session.id; cardToken = share.token;
    await page.evaluate(session => {
      const result = { id: crypto.randomUUID(), sessionId: session.id, characterId: "meng-po", generatedAt: Date.now(), fallback: false,
        title: { zh: "散会判官", en: "Meeting Adjourner" }, verdict: { zh: "五场会议，留给南瓜汤。", en: "Five meetings, left in the brew." },
        warmClosing: { zh: "今晚早点休息。", en: "Rest early tonight." }, tags: [{ zh: "放下", en: "Let go" }, { zh: "休息", en: "Rest" }], sourceTurnIds: ["story"] };
      sessionStorage.setItem(`nc_result_${session.id}`, JSON.stringify(result));
    }, session);
    await route.fulfill({ response });
  });
  await page.route("**/api/referrals", async route => {
    referralRequests++;
    expect(route.request().postDataJSON()).toEqual({ sessionId: originalSessionId });
    expect(route.request().headers()["x-nether-share"]).toBe(cardToken);
    // A second tab's admission replaces the shared cookie while A's card is
    // preparing. Keep A's header and exercise the resulting real HTTP request.
    const other = await context.request.post(`${baseURL}/api/sessions`, { headers: { Origin: baseURL! }, data: { locale: "zh", characterId: "vampire", invite, visitorId: randomUUID() } });
    expect(other.status()).toBe(200);
    secondSessionId = (await other.json()).session.id;
    const cookie = (await context.cookies()).find(item => item.name === "nc_session")!;
    expect(readSession(cookie.value, sessionSecret)?.session.id).toBe(secondSessionId);
    // Forward through the context API after B's cookie is installed. Cookie
    // overrides in route.continue are ignored by Chromium/Playwright.
    const shared = await context.request.post(`${baseURL}/api/referrals`, {
      headers: { Origin: baseURL!, "X-Nether-Share": route.request().headers()["x-nether-share"] },
      data: route.request().postDataJSON(),
    });
    expect(shared.status()).toBe(200);
    await route.fulfill({ response: shared });
  });
  await page.routeWebSocket("**/api/ws", socket => { socket.onMessage(() => {}); });
  const completion = page.waitForResponse(response => new URL(response.url()).pathname === "/api/events" && response.request().postDataJSON()?.name === "conversation_completed");
  await page.goto(`/play?${new URLSearchParams({ invite, lang: "zh" })}`);
  await page.getByRole("button", { name: "开麦，找孟婆聊聊", exact: true }).click();
  await expect(page.getByRole("button", { name: "下载身份卡 PNG", exact: true })).toBeEnabled({ timeout: 10_000 });
  const completed = await completion;
  expect(completed.status()).toBe(202);
  expect(completed.request().headers()["x-nether-share"]).toBe(cardToken);
  expect(completed.request().postDataJSON().sessionId).toBe(originalSessionId);
  expect(originalSessionId).not.toBe(secondSessionId);
  const requestsBeforeLocaleChange = referralRequests;
  await page.locator('.identity-card-section input[name="card-locale"][value="en"]').check();
  await expect(page.getByRole("button", { name: "Download Card PNG", exact: true })).toBeEnabled({ timeout: 10_000 });
  const url = new URL(await readCardQr(page));
  expect(url.searchParams.get("lang")).toBe("en");
  expect(verifyTicket(url.searchParams.get("ref")!, referralSecret, ReferralClaims)?.sourceSessionId).toBe(originalSessionId);
  expect(url.href).not.toContain(cardToken);
  expect(referralRequests).toBe(requestsBeforeLocaleChange);
  const friend = await context.request.post(`${baseURL}/api/sessions`, { headers: { Origin: baseURL! }, data: { locale: "en", characterId: "meng-po", invite: url.searchParams.get("invite"), ref: url.searchParams.get("ref"), visitorId: randomUUID() } });
  expect(friend.status()).toBe(200);
  const friendCookie = friend.headers()["set-cookie"].split(";")[0].slice("nc_session=".length);
  expect(readSession(friendCookie, sessionSecret)?.sourceSessionId).toBe(originalSessionId);
  await page.goto("about:blank");
});
