import { describe, expect, test } from "vitest";
import { generateQrDataUrl } from "../../apps/web/src/features/card/canvas";

describe("Identity card canvas and QR utilities", () => {
  test("generates high-contrast QR data URL with expected PNG header", async () => {
    const url = "https://nether-council.vercel.app/play?invite=campaign-token&ref=referral-token&character=meng-po&lang=zh";
    const dataUrl = await generateQrDataUrl(url);
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(500);
  });
});
