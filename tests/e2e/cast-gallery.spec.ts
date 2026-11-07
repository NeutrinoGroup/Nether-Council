import { expect, test, type Locator, type Page } from "@playwright/test";

const characterCount = 7;
const autoplayTimeout = 6500;
const reelFor = (page: Page) => page.locator(".cast-reel");
const dotsFor = (page: Page) => page.locator(".cast-pagination-dots button");
const cardOffset = (card: Locator) => card.evaluate((element) =>
  element.getBoundingClientRect().left - element.parentElement!.getBoundingClientRect().left
);
const positions = (page: Page) => reelFor(page).getByRole("link").evaluateAll((cards) =>
  cards.map((card) => Math.round(card.getBoundingClientRect().left * 10) / 10)
);

async function expectSelected(page: Page, index: number, timeout = 5000) {
  await expect(page.locator(".cast-position")).toHaveText(
    new RegExp(`^${String(index + 1).padStart(2, "0")}\\s*/\\s*07$`), { timeout }
  );
  await expect(dotsFor(page).nth(index)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cast-dot[aria-pressed='true']")).toHaveCount(1);
  await expect(reelFor(page).locator(".is-active")).toHaveCount(1);
  await expect.poll(async () => Math.abs(await cardOffset(reelFor(page).getByRole("link").nth(index))), { timeout })
    .toBeLessThan(1);
}

async function openGallery(page: Page) {
  await page.goto("/?lang=en");
  await reelFor(page).scrollIntoViewIfNeeded();
  await page.mouse.move(4, 4);
  await expectSelected(page, 0);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/models/meng-po.glb*", (route) =>
    route.fulfill({ status: 503, body: "Gallery test: poster fallback" })
  );
});

test("seven original artboards load; keyboard, arrows, all dots and character entry stay in sync", async ({ page }) => {
  await page.goto("/?lang=zh&invite=fixture&ref=gallery");
  const reel = reelFor(page);
  await reel.scrollIntoViewIfNeeded();
  await expect(reel).toHaveCount(1);
  await expect(reel.getByRole("link")).toHaveCount(characterCount);
  await expect(page.locator(".cast-carousel img")).toHaveCount(characterCount);
  await expect(dotsFor(page)).toHaveCount(characterCount);

  for (let index = 0; index < characterCount; index++) {
    const card = reel.getByRole("link").nth(index);
    await dotsFor(page).nth(index).click();
    await expectSelected(page, index);
    await expect(card.locator("img")).toHaveAttribute("loading", "lazy");
    await expect.poll(() => card.locator("img").evaluate((image) =>
      (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
    )).toBe(true);
  }
  const sources = await reel.locator("img").evaluateAll((images) =>
    images.map((image) => new URL((image as HTMLImageElement).src).pathname)
  );
  expect(new Set(sources).size).toBe(characterCount);
  expect(sources.every((src) => src.startsWith("/artworks/"))).toBe(true);

  await reel.focus();
  await page.keyboard.press("Home");
  await expectSelected(page, 0);
  await page.keyboard.press("End");
  await expectSelected(page, 6);
  await page.keyboard.press("ArrowRight");
  await expectSelected(page, 0);
  await page.keyboard.press("ArrowLeft");
  await expectSelected(page, 6);
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expectSelected(page, 1);
  await page.keyboard.press("ArrowLeft");
  await expectSelected(page, 0);

  await page.getByRole("button", { name: "上一位角色", exact: true }).click();
  await expectSelected(page, 6);
  await page.getByRole("button", { name: "下一位角色", exact: true }).click();
  await expectSelected(page, 0);
  await page.getByRole("button", { name: "下一位角色", exact: true }).click();
  await expectSelected(page, 1);
  await page.getByRole("button", { name: "上一位角色", exact: true }).click();
  await expectSelected(page, 0);

  // Offscreen original links remain reachable by keyboard, without duplicate focus targets.
  await reel.focus();
  await page.keyboard.press("Tab");
  await expect(reel.getByRole("link").first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expectSelected(page, 1);
  const heiWuchang = reel.getByRole("link", { name: "与这位角色开聊: 黑无常", exact: true });
  await expect(heiWuchang).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expectSelected(page, 2);
  await expect(reel.getByRole("link").nth(2)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expectSelected(page, 1);
  await expect(heiWuchang).toBeFocused();
  const destination = new URL((await heiWuchang.getAttribute("href"))!, page.url());
  expect(destination.pathname).toBe("/play");
  expect(Object.fromEntries(destination.searchParams)).toMatchObject({
    lang: "zh", character: "hei-wuchang", invite: "fixture", ref: "gallery",
  });
  const url = page.url();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /黑无常\s*今夜，听你说。/ })).toBeVisible();
  expect(page.url()).toBe(url);
  await page.getByRole("button", { name: "返回人间", exact: true }).click();
  await dotsFor(page).nth(1).click();
  await expectSelected(page, 1);
  await heiWuchang.click();
  await expect(page.getByRole("heading", { name: /黑无常\s*今夜，听你说。/ })).toBeVisible();
  expect(page.url()).toBe(url);
});

test("GSAP slides smoothly across both loop boundaries and handles interrupted navigation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openGallery(page);
  await dotsFor(page).last().click();
  await expectSelected(page, 6);

  for (const { index, name, direction } of [
    { index: 0, name: "Next character", direction: -1 },
    { index: 6, name: "Previous character", direction: 1 },
  ]) {
    // Observe actual card coordinates frame by frame, including the loop seam.
    const [samples] = await Promise.all([
      reelFor(page).getByRole("link").nth(index).evaluate((card) => new Promise<number[]>((resolve) => {
        const samples: number[] = [];
        const started = performance.now();
        const sample = () => {
          samples.push(card.getBoundingClientRect().left - card.parentElement!.getBoundingClientRect().left);
          if (performance.now() - started < 1300) requestAnimationFrame(sample);
          else resolve(samples);
        };
        requestAnimationFrame(sample);
      })),
      page.getByRole("button", { name, exact: true }).click(),
    ]);
    await expectSelected(page, index);
    const travel = Math.abs(samples[0]);
    expect(travel).toBeGreaterThan(250);
    expect(samples.filter((value) => Math.abs(value) > 2 && Math.abs(value) < travel - 2).length).toBeGreaterThan(2);
    expect(samples.slice(1).every((value, i) => (value - samples[i]) * direction >= -1)).toBe(true);
    expect(Math.abs(samples.at(-1)!)).toBeLessThan(1);
  }

  await dotsFor(page).nth(3).click();
  await expectSelected(page, 3);
  await page.getByRole("button", { name: "Next character", exact: true }).dblclick({ delay: 60 });
  await expectSelected(page, 5);
  await dotsFor(page).first().click();
  await dotsFor(page).nth(2).click();
  await expectSelected(page, 2);
});

test("autoplay advances one card, pauses on hover and focus, and resumes after leaving", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openGallery(page);
  await expectSelected(page, 1, autoplayTimeout);

  await reelFor(page).hover();
  const hovered = await positions(page);
  await page.waitForTimeout(3900);
  expect(await positions(page)).toEqual(hovered);
  await page.mouse.move(4, 4);
  await expectSelected(page, 2, autoplayTimeout);

  await reelFor(page).focus();
  const focused = await positions(page);
  await page.waitForTimeout(3900);
  expect(await positions(page)).toEqual(focused);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await expectSelected(page, 3, autoplayTimeout);
});

test("autoplay loops from the seventh card and can be explicitly paused", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openGallery(page);
  await dotsFor(page).last().click();
  await expectSelected(page, 6);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.mouse.move(4, 4);
  await expectSelected(page, 0, autoplayTimeout);

  await page.getByRole("button", { name: "Pause autoplay", exact: true }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.mouse.move(4, 4);
  const paused = await positions(page);
  await page.waitForTimeout(3900);
  expect(await positions(page)).toEqual(paused);
  await page.getByRole("button", { name: "Start autoplay", exact: true }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.mouse.move(4, 4);
  await expectSelected(page, 1, autoplayTimeout);
});

test("an automatic transition resumes from its paused position and waits while offscreen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openGallery(page);
  const first = reelFor(page).getByRole("link").first();
  await expect.poll(() => cardOffset(first), { timeout: autoplayTimeout, intervals: [30] }).toBeLessThan(-30);
  await reelFor(page).hover();
  const interrupted = await positions(page);
  await page.waitForTimeout(500);
  expect(await positions(page)).toEqual(interrupted);
  await page.mouse.move(4, 4);
  await expectSelected(page, 1, 2500);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(reelFor(page)).not.toBeInViewport();
  const offscreen = await positions(page);
  await page.waitForTimeout(3900);
  expect(await positions(page)).toEqual(offscreen);
  await reelFor(page).scrollIntoViewIfNeeded();
  await expectSelected(page, 2, autoplayTimeout);
});

test("reduced motion softens transition, preserves selection and keeps autoplay toggle interactive", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openGallery(page);
  await dotsFor(page).nth(4).click();
  await expectSelected(page, 4);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const toggle = page.getByRole("button", { name: "Pause autoplay", exact: true });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.mouse.move(4, 4);
  await page.waitForTimeout(400);
  const stopped = await positions(page);
  await page.waitForTimeout(3900);
  expect(await positions(page)).toEqual(stopped);
  await expectSelected(page, 4);
  await page.getByRole("button", { name: "Next character", exact: true }).click();
  await expectSelected(page, 5);
  await dotsFor(page).last().click();
  await expectSelected(page, 6);
  await page.getByRole("button", { name: "Start autoplay", exact: true }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.mouse.move(4, 4);
  await expectSelected(page, 0, autoplayTimeout);
});

test("touch holds pause autoplay and a swipe selects a card without opening the conversation", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Requires the touch-enabled mobile project.");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openGallery(page);
  const reel = reelFor(page);
  const box = (await reel.boundingBox())!;
  const x = box.x + box.width * 0.75;
  // Hold the reel's top inset so the browser's link long-press menu does not intercept the swipe.
  const y = box.y + 2;
  const session = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", clientX = x) => session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x: clientX, y }],
  });
  await touch("touchStart");
  const held = await positions(page);
  await page.waitForTimeout(3900);
  expect(await positions(page)).toEqual(held);
  for (const delta of [20, 60, 110, 160]) await touch("touchMove", x - delta);
  await touch("touchEnd");
  await expectSelected(page, 1);
  await expect(page.locator(".theatre")).toHaveAttribute("data-phase", "landing");
  await expectSelected(page, 2, autoplayTimeout);
  await session.detach();
});

test("English gallery remains aligned and unclipped from a large screen to a 390px phone", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "This test supplies its own viewport widths.");
  await page.goto("/?lang=en");
  for (const width of [1920, 1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const tools = page.locator(".cast-gallery-tools");
    await tools.scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Previous character", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next character", exact: true })).toBeVisible();
    for (const dot of await dotsFor(page).all()) await expect(dot).toBeVisible();
    await dotsFor(page).last().click();
    await expectSelected(page, 6);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const layout = await tools.evaluate((element) => {
      const items = [...element.querySelectorAll("p, .cast-position, button")];
      const boxes = items.map((item) => item.getBoundingClientRect());
      return {
        clipped: items.some((item) => item.scrollWidth > item.clientWidth + 1 || item.scrollHeight > item.clientHeight + 1),
        outside: boxes.some((box) => box.left < 0 || box.right > innerWidth + 1),
        overlapping: boxes.some((box, index) => boxes.slice(index + 1).some((other) =>
          Math.min(box.right, other.right) - Math.max(box.left, other.left) > 1 &&
          Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 1
        )),
        rounded: items.some((item) => item.tagName === "BUTTON" && getComputedStyle(item).borderRadius !== "0px"),
      };
    });
    expect(layout, `Gallery controls at ${width}px`).toEqual({ clipped: false, outside: false, overlapping: false, rounded: false });
  }
});
