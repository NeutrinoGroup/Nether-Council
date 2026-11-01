import { createRequire } from "node:module";
import type { Page } from "@playwright/test";

/** Decode the rendered export, rather than trusting its source URL. */
export async function readCardQr(page: Page): Promise<string | null> {
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve("jsqr") });
  return page.locator(".identity-card-canvas").evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    const decode = (window as unknown as { jsQR: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null }).jsQR;
    return decode(pixels.data, pixels.width, pixels.height)?.data ?? null;
  });
}
