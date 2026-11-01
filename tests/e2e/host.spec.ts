import { test, expect } from "@playwright/test";

test("host screen loads with guest badges, character dock and celebration", async ({ page }) => {
  await page.goto("/host?invite=test-fixture&lang=zh");

  // 1. Header checks
  await expect(page.getByText("黄泉议会 · 现场主持大屏")).toBeVisible();
  await expect(page.getByText("来宾 #1")).toBeVisible();
  await expect(page.getByText("全场手机扫码开聊")).toBeVisible();

  // 2. Control deck checks
  await expect(page.getByRole("button", { name: "开启本轮麦克风" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "下一位来宾 ➜" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "全场祝词" })).toBeEnabled();

  // 3. Switch characters
  await page.getByRole("button", { name: "黑无常" }).click();
  await expect(page.getByRole("heading", { name: "黑无常", exact: true })).toBeVisible();

  // 4. Switch languages
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Hei Wuchang", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Live Turn" })).toBeEnabled();

  // 5. Next guest increments counter
  await page.getByRole("button", { name: "Next Guest ➜" }).click();
  await expect(page.getByText("Guest #2")).toBeVisible();

  // 6. Trigger celebration
  const toastBtn = page.getByRole("button", { name: "Toast", exact: true });
  await toastBtn.scrollIntoViewIfNeeded();
  await toastBtn.click();
  await expect(page.locator(".host-celebration-banner")).toBeVisible();
  await expect(page.getByText("ALL-HALL CELEBRATION")).toBeVisible();
});
