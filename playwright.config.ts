import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, timeout: 30000,
  use: { baseURL: "http://localhost:3100", permissions: ["microphone"], reducedMotion: "reduce", launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } },
  projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 1000 } } }, { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
  webServer: { command: "pnpm --filter @nether/web audio:build && pnpm --filter @nether/web exec next dev --port 3100", url: "http://localhost:3100", reuseExistingServer: false, timeout: 60000, env: { VOICE_ENABLED: "false" } },
});
