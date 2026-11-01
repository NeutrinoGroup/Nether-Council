import { expect, test } from "@playwright/test";

test("theatre loads real 3D, switches language and preserves admission through cast entry", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  let microphoneRequested = false;
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error("UNEXPECTED_MICROPHONE"); }; });
  page.on("pageerror", error => { if (error.message.includes("UNEXPECTED_MICROPHONE")) microphoneRequested = true; });
  await page.goto("/?invite=test-fixture&ref=friend-fixture&lang=en&character=werewolf");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("LEAVE ITWITH THE SPIRITS.");
  await expect(page.locator(".theatre-stage")).toHaveAttribute("data-model-loaded", "true", { timeout: 20000 });
  await expect(page.locator(".theatre-stage canvas")).toBeVisible();
  await page.getByRole("button", { name: "切换到中文" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("把烦恼留在人间。");
  await page.getByRole("link", { name: "与这位角色开聊: 钟馗", exact: true }).click();
  await expect(page).toHaveURL(/\/play\?/);
  const params = new URL(page.url()).searchParams;
  expect(Object.fromEntries(params)).toEqual({ invite: "test-fixture", ref: "friend-fixture", lang: "zh", character: "zhong-kui" });
  await expect(page.getByRole("heading", { name: "钟馗", exact: true })).toBeVisible();
  expect(microphoneRequested).toBe(false);
  expect(errors).toEqual([]);
});

test("failed landing GLB leaves poster and a usable encounter entry", async ({ page }) => {
  await page.route("**/models/meng-po.glb", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/?lang=en&invite=test-fixture");
  await expect(page.getByText("3D is unavailable. Your voice encounter is still ready.")).toBeVisible({ timeout: 20000 });
  await expect(page.getByAltText("Meng Po holding her pumpkin brew")).toBeVisible();
  await expect(page.getByRole("link", { name: "Step inside. Meet Meng Po" })).toHaveAttribute("href", /\/play\?.*invite=test-fixture/);
});

test("scroll narrative respects motion preference and fits narrow screens", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?lang=en");
  await expect(page.locator(".theatre-stage")).toHaveAttribute("data-model-loaded", "true", { timeout: 20000 });
  const initial = await page.locator(".theatre-halo").evaluate(el => getComputedStyle(el).transform);
  await page.locator("#cast").scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator(".theatre-halo").evaluate(el => getComputedStyle(el).transform)).not.toBe(initial);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.locator(".theatre-halo").evaluate(el => getComputedStyle(el).transform)).toBe("none");
  await expect(page.locator("#gift-title")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The footer action keeps an existing character choice rather than dropping it.
  await page.goto("/?lang=en&character=werewolf&invite=test-fixture");
  await expect(page.getByRole("link", { name: "Begin my encounter" })).toHaveAttribute("href", /character=werewolf/);
});
