import { expect, test } from "@playwright/test";

const rows = ".cast-ribbon-reel, .cast-reel";
const positions = async (page: import("@playwright/test").Page) =>
  page.locator(rows).evaluateAll((elements) => elements.map((element) => element.scrollLeft));

test.beforeEach(async ({ page }) => {
  await page.route("**/models/meng-po.glb*", (route) =>
    route.fulfill({ status: 503, body: "Gallery test: poster fallback" })
  );
});

test("cast gallery loads all seven artboards and posters, supports keyboard/buttons/dots and opens a character in place", async ({
  page,
}) => {
  await page.goto("/?lang=zh&invite=fixture&ref=gallery");
  await page.locator("#cast").scrollIntoViewIfNeeded();
  const reel = page.getByRole("region", { name: "角色原画，左右滑动选择角色" });
  const previous = page.getByRole("button", { name: "上一位角色" });
  const next = page.getByRole("button", { name: "下一位角色" });
  const position = page.locator(".cast-position");

  await expect(reel.getByRole("link")).toHaveCount(7);
  await expect(reel.locator("img")).toHaveCount(7);

  for (const card of await reel.getByRole("link").all()) {
    await expect(card.locator("img")).toHaveAttribute("loading", "lazy");
    await card.focus();
    await expect
      .poll(() => card.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }

  const sources = await page
    .locator(".cast-carousel img")
    .evaluateAll((images) => [...new Set(images.map((image) => new URL((image as HTMLImageElement).src).pathname))]);
  expect(sources.filter((src) => src.startsWith("/artworks/"))).toHaveLength(7);
  expect(sources.filter((src) => src.startsWith("/posters/"))).toHaveLength(7);

  await reel.focus();
  await page.keyboard.press("End");
  await expect
    .poll(() => reel.evaluate((element) => element.scrollWidth - element.clientWidth - element.scrollLeft))
    .toBeLessThanOrEqual(2);
  await expect(position).toHaveText(/(?:^|–)07\s*\/\s*07$/);

  await page.keyboard.press("Home");
  await expect.poll(() => reel.evaluate((element) => element.scrollLeft)).toBeLessThanOrEqual(2);

  await next.click();
  await expect.poll(() => reel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(100);
  await previous.click();
  await expect.poll(() => reel.evaluate((element) => element.scrollLeft)).toBeLessThanOrEqual(5);

  await reel.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => reel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(100);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => reel.evaluate((element) => element.scrollLeft)).toBeLessThanOrEqual(5);

  const zhongKui = reel.getByRole("link", { name: "与这位角色开聊: 钟馗", exact: true });
  const destination = new URL((await zhongKui.getAttribute("href"))!, page.url());
  expect(destination.pathname).toBe("/play");
  expect(Object.fromEntries(destination.searchParams)).toMatchObject({
    lang: "zh",
    character: "zhong-kui",
    invite: "fixture",
    ref: "gallery",
  });
  const url = page.url();
  await zhongKui.click();
  await expect(page.getByRole("heading", { name: /钟馗\s*今夜，听你说。/ })).toBeVisible();
  expect(page.url()).toBe(url);
});

test("auto-scrolls continuously when idle, responds to GSAP mouse wheel scrolling, and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?lang=en");
  await page.locator(".cast-gallery-tools").scrollIntoViewIfNeeded();
  await page.mouse.move(4, 4);

  // Detail rail starts near its right edge and flows in reverse.
  await expect.poll(async () => (await positions(page))[2]).toBeGreaterThan(100);

  // Verify automatic scrolling advances all three rails without user input.
  const initial = await positions(page);
  await expect.poll(async () => (await positions(page))[0], { timeout: 3000 }).toBeGreaterThan(initial[0] + 12);
  await expect.poll(async () => (await positions(page))[1], { timeout: 3000 }).toBeGreaterThan(initial[1] + 12);
  await expect.poll(async () => (await positions(page))[2], { timeout: 3000 }).toBeLessThan(initial[2] - 12);

  // Verify GSAP wheel listener accelerates the three rails (upper/center forward, lower reverse).
  const beforeWheel = await positions(page);
  await page.mouse.wheel(0, 220);
  await expect.poll(async () => (await positions(page))[0]).toBeGreaterThan(beforeWheel[0] + 20);
  await expect.poll(async () => (await positions(page))[1]).toBeGreaterThan(beforeWheel[1] + 20);
  await expect.poll(async () => (await positions(page))[2]).toBeLessThan(beforeWheel[2] - 20);

  // Switching to reduced-motion tears down GSAP ticker/wheel listeners and resets scroll positions.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => positions(page)).toEqual([0, 0, 0]);
  const reduced = await positions(page);
  await page.mouse.wheel(0, -150);
  await page.waitForTimeout(500);
  expect(await positions(page)).toEqual(reduced);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("English gallery controls remain readable at tablet and phone widths", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "This test supplies its own three viewport widths.");
  await page.goto("/?lang=en");
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const tools = page.locator(".cast-gallery-tools");
    await tools.scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Previous character" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next character" })).toBeVisible();
    await expect(page.locator(".cast-position")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const layout = await tools.evaluate((element) => {
      const items = [...element.querySelectorAll("p, .cast-position, .cast-arrow")];
      const boxes = items.map((item) => item.getBoundingClientRect());
      return {
        clipped: items.some(
          (item) => item.scrollWidth > item.clientWidth + 1 || item.scrollHeight > item.clientHeight + 1
        ),
        outside: boxes.some((box) => box.left < 0 || box.right > innerWidth + 1),
        overlapping: boxes.some((box, index) =>
          boxes
            .slice(index + 1)
            .some(
              (other) =>
                Math.min(box.right, other.right) - Math.max(box.left, other.left) > 1 &&
                Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 1
            )
        ),
      };
    });
    expect(layout, `Gallery controls at ${width}px`).toEqual({ clipped: false, outside: false, overlapping: false });
  }
});
