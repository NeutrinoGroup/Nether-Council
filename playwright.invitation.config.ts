import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = Number(process.env.NETHER_INVITATION_PORT ?? 3247);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid NETHER_INVITATION_PORT");

export default defineConfig({
  ...base,
  testMatch: "invitation.spec.ts",
  testIgnore: [],
  outputDir: "artifacts/invitation-test-results",
  use: { ...base.use, baseURL: `http://localhost:${port}` },
  webServer: {
    ...base.webServer,
    command: `pnpm --filter @nether/web audio:build && pnpm --filter @nether/web exec next dev --hostname localhost --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: {
      NEXT_BUILD_DIR: ".next-invitation", VOICE_ENABLED: "true",
      NEXT_PUBLIC_CAMPAIGN_ID: "invitation-e2e-fixture",
      SESSION_SIGNING_SECRET: "invitation-session-fixture-secret-32-characters",
      CAMPAIGN_SIGNING_SECRET: "invitation-campaign-fixture-secret-32-characters",
      REFERRAL_SIGNING_SECRET: "invitation-referral-fixture-secret-32-characters",
      AUTH_SIGNING_SECRET: "invitation-auth-fixture-secret-32-characters",
      HOST_ACCESS_SECRET: "invitation-host-fixture-secret-32-characters",
      NETHER_AUTH_DEMO: "true", NEXT_PUBLIC_NETHER_AUTH_DEMO: "true",
      QWEN_DUPLEX_API_KEY: "fixture-no-provider-access", QWEN_REALTIME_URL: "wss://provider.fixture.invalid/realtime",
      QWEN_REALTIME_MODEL: "fixture", QWEN_TEXT_API_KEY: "fixture-no-text-access",
      QWEN_TEXT_BASE_URL: "https://provider.fixture.invalid/text", QWEN_TEXT_MODEL: "fixture",
      VOICE_GATEWAY_URL: "", VOICE_GATEWAY_SECRET: "",
      NETHER_DATA_INGEST_URL: "", NETHER_DATA_INGEST_SECRET: "",
      SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_SERVICE_KEY: "",
      GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "",
    },
  },
});
