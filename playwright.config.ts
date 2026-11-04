import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";
const port = Number(process.env.NETHER_E2E_PORT ?? 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid NETHER_E2E_PORT");
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 45000,
  // Use a virtual output clock for deterministic tests, independent of the Mac's selected speaker.
  // These tests never certify an audible output device or a human listening session.
  use: { baseURL: `http://127.0.0.1:${port}`, permissions: ["microphone"], reducedMotion: "reduce", launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-audio-output"] } },
  projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 1000 } } }, { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
  webServer: { command: `pnpm --filter @nether/web audio:build && pnpm --filter @nether/web exec next dev --hostname 127.0.0.1 --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 60000, env: { VOICE_ENABLED: "false", NETHER_AUTH_DEMO: "true", NEXT_PUBLIC_NETHER_AUTH_DEMO: "true", AUTH_SIGNING_SECRET: randomBytes(32).toString("hex") } },
});
