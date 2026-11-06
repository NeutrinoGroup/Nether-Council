import { expect, test } from "@playwright/test";

const rows = ".cast-ribbon-reel, .cast-reel";
const positions = async (page: import("@playwright/test").Page) => page.locator(rows).evaluateAll(elements => elements.map(element => element.scrollLeft));

test("cast gallery loads all seven artboards and posters and keeps manual selection accessible", async ({ page }) => {
  await page.goto("/?lang=zh");
  await page.locator("#cast").scrollIntoViewIfNeeded();
  const reel = page.getByRole("region", { name: "角色原画，左右滑动选择角色" });
  await expect(reel.getByRole("link")).toHaveCount(7);
  // Bring each image into view before asserting browser-native lazy loading.
  for (const card of await reel.getByRole("link").all()) {
    await card.focus();
    await expect.poll(() => card.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await reel.getByRole("link").first().focus();
  const sources = await page.locator(".cast-carousel img").evaluateAll(images => [...new Set(images.map(image => new URL((image as HTMLImageElement).src).pathname))]);
  expect(sources.filter(src => src.startsWith("/artworks/"))).toHaveLength(7);
  expect(sources.filter(src => src.startsWith("/posters/"))).toHaveLength(7);
  await reel.evaluate(element => { element.scrollLeft = 0; });
  await page.getByRole("button", { name: "下一位角色" }).click();
  await expect.poll(() => reel.evaluate(element => element.scrollLeft)).toBeGreaterThan(100);
  await page.getByRole("button", { name: "上一位角色" }).click();
  await expect.poll(() => reel.evaluate(element => element.scrollLeft)).toBeLessThan(5);
  await reel.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => reel.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const url = page.url();
  await reel.getByRole("link", { name: "与这位角色开聊: 钟馗", exact: true }).click();
  await expect(page.getByRole("heading", { name: /钟馗\s*今夜，听你说。/ })).toBeVisible();
  expect(page.url()).toBe(url);
});

test("vertical scrolling moves all three rails, with the lower rail in the opposite direction", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?lang=en");
  await page.locator(".cast-gallery-tools").scrollIntoViewIfNeeded();
  await expect.poll(async () => (await positions(page))[2]).toBeGreaterThan(100);
  const before = await positions(page);
  await page.mouse.wheel(0, 200);
  await expect.poll(async () => (await positions(page))[0]).toBeGreaterThan(before[0] + 10);
  await expect.poll(async () => (await positions(page))[1]).toBeGreaterThan(before[1] + 10);
  await expect.poll(async () => (await positions(page))[2]).toBeLessThan(before[2] - 10);
  // Changing the preference tears down scrub listeners and preserves manual browsing.
  await page.emulateMedia({ reducedMotion: "reduce" });
  // matchMedia cleanup restores native scroll positions asynchronously.
  await expect.poll(() => positions(page)).toEqual([0, 0, 0]);
  const reduced = await positions(page);
  await page.mouse.wheel(0, -150);
  await page.waitForTimeout(800);
  expect(await positions(page)).toEqual(reduced);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
