import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base, workers: 1, testMatch: "realtime.spec.ts", outputDir: "artifacts/realtime-test-results", webServer: { ...base.webServer, command: "pnpm --filter @nether/web audio:build && pnpm --filter @nether/web exec next dev --port 3208", url: "http://localhost:3208", env: { VOICE_ENABLED: "false", NEXT_BUILD_DIR: ".next-realtime" } }, use: { ...base.use, baseURL: "http://localhost:3208" } });
