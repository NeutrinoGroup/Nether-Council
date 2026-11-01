import { expect, test } from "@playwright/test";

test("same-page threshold preserves admission and waits for an explicit microphone gesture", async ({ page }) => {
  let microphoneRequests = 0;
  await page.exposeFunction("recordMicRequest", () => microphoneRequests++);
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { await (window as unknown as { recordMicRequest: () => Promise<void> }).recordMicRequest(); throw new Error("No microphone in this navigation test"); }; });
  await page.goto("/?invite=test-fixture&ref=friend-fixture&lang=en");
  await expect(page.locator(".theatre-stage")).toHaveAttribute("data-model-loaded", "true", { timeout: 20000 });
  await page.getByRole("button", { name: "切换到中文" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("把烦恼留在人间。");
  const url = page.url();
  await page.getByRole("button", { name: "推门，遇见孟婆" }).click();
  await expect(page.locator(".theatre")).toHaveAttribute("data-phase", "conversation");
  expect(page.url()).toBe(url);
  await expect(page.getByRole("button", { name: "开麦，向孟婆倾诉" })).toBeEnabled();
  expect(microphoneRequests).toBe(0);
  await page.getByRole("button", { name: "返回人间" }).click();
  await expect(page.getByRole("button", { name: "推门，遇见孟婆" })).toBeFocused();
  await page.getByRole("link", { name: "与这位角色开聊: 钟馗", exact: true }).click();
  await expect(page.getByRole("heading", { name: /钟馗\s*今夜，听你说。/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "开麦，向钟馗倾诉" })).toBeEnabled();
  expect(page.url()).toBe(url);
  expect(microphoneRequests).toBe(0);
});

test("failed GLB keeps the same-page encounter accessible", async ({ page }) => {
  await page.route("**/models/meng-po.glb", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/?lang=en");
  await expect(page.getByText("3D is unavailable. Your voice encounter is still ready.")).toBeAttached({ timeout: 20000 });
  await expect(page.getByAltText("Meng Po holding her pumpkin brew")).toBeVisible();
  await page.getByRole("button", { name: "Step inside. Meet Meng Po" }).click();
  await expect(page.getByRole("button", { name: "Turn on mic & talk" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on mic & talk" })).toBeDisabled();
});

test("camera advances and holds its close-up after the panel wakes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?lang=en");
  const canvas = page.locator(".theatre-stage canvas");
  await expect(page.locator(".theatre-stage")).toHaveAttribute("data-model-loaded", "true", { timeout: 20000 });
  await expect.poll(() => canvas.getAttribute("data-camera-z").then(Number)).toBeGreaterThan(6);
  await page.getByRole("button", { name: "Step inside. Meet Meng Po" }).click();
  await expect(page.locator(".theatre")).toHaveAttribute("data-phase", "conversation");
  await expect.poll(() => canvas.getAttribute("data-camera-z").then(Number)).toBeLessThan(4.2);
  await page.waitForTimeout(400);
  expect(Number(await canvas.getAttribute("data-camera-z"))).toBeLessThan(4.2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
