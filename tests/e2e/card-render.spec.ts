import { expect, test } from "./fixtures";
import type { Page, Route } from "@playwright/test";
import { readCardQr } from "../../scripts/lib/read-card-qr";

const id = "99999999-9999-4999-8999-999999999999";
const shareUrl = "https://ghost.oodai.space/play?invite=fixture&ref=fixture&character=meng-po&lang=zh";

// A validated cached result isolates the card from provider/voice timing.
// Card readiness uses the spec's 10-second budget, including async PNG encoding.
async function openCard(page: Page, referral?: (route: Route) => void, fallback = false) {
  const now = Date.now();
  const session = { id, characterId: "meng-po", locale: "zh", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  const result = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: id, characterId: "meng-po", generatedAt: now, fallback, title: { zh: "散会判官", en: "Meeting Adjourner" }, verdict: { zh: "五场会议，留给南瓜汤。", en: "Five meetings, left in the brew." }, warmClosing: { zh: "今晚早点休息。", en: "Rest early tonight." }, tags: [{ zh: "放下", en: "Let go" }, { zh: "休息", en: "Rest" }], sourceTurnIds: ["story"] };
  await page.addInitScript(result => sessionStorage.setItem(`nc_result_${result.sessionId}`, JSON.stringify(result)), result);
  await page.route("**/models/*.glb*", route => route.fulfill({ status: 503 }));
  await page.route("**/api/sessions", route => route.fulfill({ json: { session } }));
  await page.route("**/api/events", route => route.fulfill({ status: 202 }));
  await page.route("**/api/referrals", referral ?? (route => route.fulfill({ json: { shareUrl } })));
  await page.routeWebSocket("**/api/ws", socket => {
    let seq = 0;
    socket.onMessage(raw => {
      const event = JSON.parse(String(raw));
      if (event.type === "session.start" || event.type === "ping") socket.send(JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: seq++, ...(event.type === "ping" ? { type: "pong" } : { type: "session.ready", session }) }));
    });
  });
  await page.goto("/play?invite=fixture&lang=zh");
  await page.getByRole("button", { name: "开麦，找孟婆聊聊" }).click();
  await expect(page.locator(".identity-card-section")).toBeVisible();
}

test("download waits for a complete card and its scannable invitation", async ({ page }) => {
  let pending: Route | undefined;
  await openCard(page, route => { pending = route; });
  await expect.poll(() => Boolean(pending)).toBe(true);
  const downloadButton = page.getByRole("button", { name: "下载身份卡 PNG" });
  await expect(downloadButton).toBeDisabled();
  await pending!.fulfill({ json: { shareUrl } });
  await expect(downloadButton).toBeEnabled({ timeout: 10_000 });
  expect(await readCardQr(page)).toBe(shareUrl);
  const download = page.waitForEvent("download");
  await downloadButton.click();
  expect((await download).suggestedFilename()).toBe(`nether-identity-${id.slice(0, 8)}.png`);
});

test("a delayed old render cannot restore hidden story details", async ({ page }) => {
  await openCard(page);
  await expect(page.locator(".card-rendering-indicator")).toHaveCount(0, { timeout: 10_000 });
  await page.evaluate(() => {
    let release!: () => void;
    let held = false;
    const ready = document.fonts.ready;
    const gate = new Promise<void>(resolve => { release = resolve; });
    Object.defineProperty(document.fonts, "ready", { configurable: true, get: () => {
      if (held) return ready;
      held = true;
      return gate.then(() => ready);
    } });
    Object.assign(window, { releaseCardFonts: release });
  });
  await page.locator("#card-nickname-input").fill("先前称呼");
  await expect(page.locator(".card-rendering-indicator")).toBeVisible();
  await page.getByLabel("在分享卡上隐去我的具体经历评价").check();
  await page.locator("#card-nickname-input").fill("现在称呼");
  await expect(page.locator(".card-rendering-indicator")).toHaveCount(0, { timeout: 10_000 });
  const pixels = () => page.locator(".identity-card-canvas").evaluate(async canvas => {
    const data = new TextEncoder().encode((canvas as HTMLCanvasElement).toDataURL());
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), byte => byte.toString(16).padStart(2, "0")).join("");
  });
  const latest = await pixels();
  await page.evaluate(() => (window as unknown as { releaseCardFonts: () => void }).releaseCardFonts());
  // Let the released render finish its data-URL image decode, then compare the
  // entire visible export. Old text must not replace the hidden-verdict version.
  await page.waitForTimeout(500);
  expect(await pixels()).toBe(latest);
});

test("PNG encoding failure is visible and can be retried", async ({ page }) => {
  await observeCardTelemetry(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let failed = false;
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      if (!failed && this.width === 1080 && this.height === 1440) {
        failed = true; callback(null); return;
      }
      original.call(this, callback, ...args);
    };
  });
  await openCard(page);
  await expect(page.locator(".identity-card-section [role=alert]")).toBeVisible();
  await expect(page.getByRole("button", { name: "下载身份卡 PNG" })).toBeDisabled();
  expect(await cardTelemetry(page)).toEqual([]);
  await page.getByRole("button", { name: "重新绘制身份卡" }).click();
  await expect(page.getByRole("button", { name: "下载身份卡 PNG" })).toBeEnabled({ timeout: 10_000 });
  expect(await readCardQr(page)).toBe(shareUrl);
  await expect.poll(() => cardTelemetry(page)).toEqual([
    { name: "card_rendered", previewVisible: true },
    { name: "conversation_completed", previewVisible: true },
  ]);
});

async function observeCardTelemetry(page: Page) {
  await page.addInitScript(() => {
    const events: { name: string; previewVisible: boolean }[] = [];
    Object.assign(window, { cardTelemetry: events });
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (input === "/api/events") {
        const event = JSON.parse(String(init?.body));
        if (["card_rendered", "conversation_completed"].includes(event.name)) {
          const canvas = document.querySelector<HTMLCanvasElement>(".identity-card-canvas");
          const bounds = canvas?.getBoundingClientRect();
          events.push({ name: event.name, previewVisible: Boolean(canvas && !canvas.hidden && bounds && bounds.width > 0 && bounds.height > 0) });
        }
      }
      return fetch(input, init);
    };
  });
}
const cardTelemetry = (page: Page) => page.evaluate(() => (window as unknown as { cardTelemetry: { name: string; previewVisible: boolean }[] }).cardTelemetry);

test("only a visible personalized card completes the encounter once across redraws", async ({ page }) => {
  await observeCardTelemetry(page);
  let pending: Route | undefined;
  await openCard(page, route => { pending = route; });
  await expect.poll(() => Boolean(pending)).toBe(true);
  expect(await cardTelemetry(page)).toEqual([]);
  await pending!.fulfill({ json: { shareUrl } });
  await expect(page.locator(".identity-card-canvas")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => cardTelemetry(page)).toEqual([
    { name: "card_rendered", previewVisible: true },
    { name: "conversation_completed", previewVisible: true },
  ]);
  await page.locator("#card-nickname-input").fill("新的称呼");
  await expect(page.getByRole("button", { name: "下载身份卡 PNG" })).toBeEnabled({ timeout: 10_000 });
  await page.locator('input[name="card-locale"][value="en"]').check();
  await expect(page.getByRole("button", { name: "Download Card PNG" })).toBeEnabled({ timeout: 10_000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await cardTelemetry(page)).toHaveLength(2);
});

test("a fallback card can be previewed without counting as personalized completion", async ({ page }) => {
  await observeCardTelemetry(page);
  await openCard(page, undefined, true);
  await expect(page.locator(".identity-card-canvas")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => cardTelemetry(page)).toEqual([{ name: "card_rendered", previewVisible: true }]);
});
