import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createRequire } from "node:module";

async function openShare(page: Page, query = "?lang=zh") {
  await page.goto(`/${query}`);
  await expect(page.getByRole("button", { name: "Google 登录" })).toBeVisible();
  await page.getByRole("button", { name: "体验登录" }).click();
  await expect(page.getByText("Alexander (孟婆座下客)")).toBeVisible();
  await page.getByRole("button", { name: "分享 / 二维码" }).click();
}

async function readShareQr(page: Page) {
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve("jsqr") });
  return page.getByAltText("Halloween Share QR Code").evaluate(async element => {
    const image = element as HTMLImageElement;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const decode = (window as unknown as { jsQR: (pixels: Uint8ClampedArray, width: number, height: number) => { data: string } | null }).jsQR;
    return decode(pixels.data, pixels.width, pixels.height)?.data;
  });
}

test("a missing valid invitation disables share QR and download", async ({ page }) => {
  await page.route("**/api/referrals", route => route.fulfill({ status: 401, json: { error: "UNAUTHORIZED" } }));
  await openShare(page);
  await expect(page.getByText("请先打开有效的活动邀请")).toBeVisible();
  await expect(page.getByAltText("Halloween Share QR Code")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "复制链接" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "下载二维码图片 (PNG)" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByText("万圣专属通行证 · 邀好友入席")).not.toBeVisible();
  await page.getByRole("button", { name: "退出" }).click();
  await expect(page.getByRole("button", { name: "Google 登录" })).toBeVisible();
});

test("share QR encodes the server invitation and copy confirms successful clipboard access", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const shareUrl = "https://ghost.oodai.space/play?invite=signed-campaign.test-signature&ref=signed-source.test-signature&character=zhong-kui&lang=zh";
  let requestBody: unknown;
  await page.route("**/api/referrals", route => { requestBody = route.request().postDataJSON(); return route.fulfill({ json: { shareUrl } }); });
  await openShare(page, "?invite=original-campaign.signature&ref=old-source.signature&character=zhong-kui&lang=zh&hostCredential=do-not-share");
  await expect(page.getByAltText("Halloween Share QR Code")).toBeVisible();
  expect(requestBody).toEqual({ invite: "original-campaign.signature", characterId: "zhong-kui", locale: "zh" });
  expect(await readShareQr(page)).toBe(shareUrl);
  await page.getByRole("button", { name: "复制链接" }).click();
  await expect(page.getByRole("button", { name: "已复制！" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shareUrl);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载二维码图片 (PNG)" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
});

test("clipboard failure is reported without claiming the invite was copied", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new DOMException("denied", "NotAllowedError")) } });
    document.execCommand = () => false;
  });
  await page.route("**/api/referrals", route => route.fulfill({ json: { shareUrl: "https://ghost.oodai.space/play?invite=signed.test" } }));
  await openShare(page);
  await expect(page.getByRole("button", { name: "复制链接" })).toBeEnabled();
  await page.getByRole("button", { name: "复制链接" }).click();
  await expect(page.getByText("复制失败，请手动复制邀请链接。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "已复制！" })).toHaveCount(0);
});

test("a transient invitation error can retry and show a fresh QR", async ({ page }) => {
  let unavailable = true;
  await page.route("**/api/referrals", route => unavailable
    ? route.fulfill({ status: 503, json: { error: "UNAVAILABLE" } })
    : route.fulfill({ json: { shareUrl: "https://ghost.oodai.space/play?invite=signed.test" } }));
  await openShare(page);
  await expect(page.getByText("邀请暂时无法生成，请重试。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "复制链接" })).toBeDisabled();
  unavailable = false;
  await page.getByRole("button", { name: "重新生成邀请" }).click();
  await expect(page.getByAltText("Halloween Share QR Code")).toBeVisible();
  expect(await readShareQr(page)).toBe("https://ghost.oodai.space/play?invite=signed.test");
});

test("successful OAuth restores the invitation through a server navigation", async ({ page }) => {
  const profile = { id: "test-google-id", googleId: "test-google-id", email: "test@example.test", emailVerified: true, name: "OAuth Guest", referralCode: "nc_test" };
  let authenticated = false;
  await page.route("**/api/auth/session", route => route.fulfill({ json: authenticated ? { authenticated, profile } : { authenticated: false } }));
  await page.route("**/api/auth/google/start", route => route.fulfill({ status: 302, headers: { location: "/?code=oauth-fixture-code&state=oauth-fixture-state" }, body: "" }));
  await page.route("**/api/auth/google/exchange", route => { authenticated = true; return route.fulfill({ json: { profile } }); });
  const query = "?invite=campaign.signature&ref=source.signature&character=zhong-kui&lang=zh";
  await page.goto(`/play${query}&hostCredential=must-not-return&returnURL=https://evil.test`);
  const navigation = page.waitForRequest(request => request.isNavigationRequest() && new URL(request.url()).pathname === "/play" && !new URL(request.url()).searchParams.has("hostCredential"));
  await page.getByRole("button", { name: "Google 登录" }).click();
  await navigation;
  await expect(page).toHaveURL(new RegExp(`/play\\?invite=campaign.signature&ref=source.signature&character=zhong-kui&lang=zh$`));
  await expect(page.getByText("OAuth Guest", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("nc_entry_context"))).toBeNull();
});

test("sharing uses the selected language even when the entry URL still uses Chinese", async ({ page }) => {
  let locale: string | undefined;
  await page.route("**/api/referrals", route => {
    locale = route.request().postDataJSON().locale;
    return route.fulfill({ json: { shareUrl: `https://ghost.oodai.space/play?invite=signed.test&lang=${locale}` } });
  });
  await openShare(page);
  await expect(page.getByAltText("Halloween Share QR Code")).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "切换到 English" }).click();
  await expect(page).toHaveURL(/lang=zh/);
  await page.getByRole("button", { name: "Share & QR" }).click();
  await expect(page.getByAltText("Halloween Share QR Code")).toBeVisible();
  expect(locale).toBe("en");
  expect(await readShareQr(page)).toContain("lang=en");
});

test("an invitation stays usable until its admission deadline and then removes its QR", async ({ page }) => {
  const now = new Date("2026-11-07T00:00:00Z");
  const maxTimer = 2_147_483_647;
  await page.clock.install({ time: now });
  await page.route("**/api/referrals", route => route.fulfill({ json: {
    shareUrl: "https://ghost.oodai.space/play?invite=signed.test",
    expiresAt: now.getTime() + maxTimer + 100_000 + 235_000,
  } }));
  await openShare(page);
  await expect(page.getByAltText("Halloween Share QR Code")).toBeVisible();
  await page.clock.fastForward(maxTimer);
  await expect(page.getByRole("button", { name: "复制链接" })).toBeEnabled();
  await page.clock.fastForward(100_001);
  await expect(page.getByText("请先打开有效的活动邀请")).toBeVisible();
  await expect(page.getByAltText("Halloween Share QR Code")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "复制链接" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "下载二维码图片 (PNG)" })).toBeDisabled();
});

test("QR generation failure can be retried without exposing a stale invitation", async ({ page }) => {
  let oversized = true;
  await page.route("**/api/referrals", route => route.fulfill({ json: {
    shareUrl: `https://ghost.oodai.space/play?invite=${oversized ? "x".repeat(10_000) : "signed.test"}`,
  } }));
  await openShare(page);
  await expect(page.getByText("邀请暂时无法生成，请重试。", { exact: true })).toBeVisible();
  await expect(page.getByAltText("Halloween Share QR Code")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "复制链接" })).toBeDisabled();
  oversized = false;
  await page.getByRole("button", { name: "重新生成邀请" }).click();
  await expect(page.getByAltText("Halloween Share QR Code")).toBeVisible();
  expect(await readShareQr(page)).toBe("https://ghost.oodai.space/play?invite=signed.test");
});
