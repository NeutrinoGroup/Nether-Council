import { expect, test } from "@playwright/test";

test("Google login, user state, and share QR modal flow", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?lang=zh");

  // 1. Verify Google Sign-in button is in header
  const loginBtn = page.getByRole("button", { name: "Google 登录" });
  await expect(loginBtn).toBeVisible();

  const demoBtn = page.getByRole("button", { name: "体验登录" });
  await expect(demoBtn).toBeVisible();

  // 2. Click Demo login
  await demoBtn.click();

  // 3. User badge appears with name and Share / QR button
  await expect(page.getByText("Alexander (孟婆座下客)")).toBeVisible();
  const shareBtn = page.getByRole("button", { name: "分享 / 二维码" });
  await expect(shareBtn).toBeVisible();

  // 4. Open Share / QR modal
  await shareBtn.click();

  await expect(page.getByText("万圣专属通行证 · 邀好友入席")).toBeVisible();
  await expect(page.getByText("专属异界通行码:")).toBeVisible();
  await expect(page.getByAltText("Halloween Share QR Code")).toBeVisible();

  // 5. Test copy link button feedback
  const copyBtn = page.getByRole("button", { name: "复制链接" });
  await expect(copyBtn).toBeVisible();
  await copyBtn.click();
  await expect(page.getByRole("button", { name: "已复制！" })).toBeVisible();

  // 6. Close modal
  await page.keyboard.press("Escape");
  await expect(page.getByText("万圣专属通行证 · 邀好友入席")).not.toBeVisible();

  // 7. Sign out
  await page.getByRole("button", { name: "退出" }).click();
  await expect(page.getByRole("button", { name: "Google 登录" })).toBeVisible();
});
