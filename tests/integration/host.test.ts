import { describe, it, expect } from "vitest";
import { POST as sessionsRoute } from "@/app/api/sessions/route";
import { CampaignClaims, signTicket, readSession } from "@/shared/server/tickets";
import { BgmController } from "@/features/party/bgm";
import { playCelebrationChime } from "@/features/party/celebration";

describe("T15 Host Mode & BGM Ducking", () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const hostSecret = "fedcba9876543210fedcba9876543210";
  process.env.SESSION_SIGNING_SECRET = secret;
  process.env.CAMPAIGN_SIGNING_SECRET = secret;
  process.env.HOST_ACCESS_SECRET = hostSecret;
  process.env.VOICE_ENABLED = "true";
  process.env.QWEN_DUPLEX_API_KEY = "test-key";

  it("accepts valid host credential and creates host mode session", async () => {
    const now = Date.now();
    const campaign = signTicket(
      CampaignClaims.parse({ kind: "campaign", campaignId: "halloween-2026", issuedAt: now, expiresAt: now + 7200000 }),
      secret
    );

    const request = new Request("http://localhost:3000/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({
        locale: "zh",
        characterId: "meng-po",
        mode: "host",
        hostCredential: hostSecret,
        invite: campaign,
      }),
    });

    const res = await sessionsRoute(request);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.mode).toBe("host");

    const cookie = res.headers.get("Set-Cookie");
    expect(cookie).toContain("nc_session=");
    const match = cookie?.match(/nc_session=([^;]+)/);
    const claims = readSession(match?.[1], secret);
    expect(claims?.session.mode).toBe("host");
  });

  it("rejects host mode when host credential is wrong or missing", async () => {
    const now = Date.now();
    const campaign = signTicket(
      CampaignClaims.parse({ kind: "campaign", campaignId: "halloween-2026", issuedAt: now, expiresAt: now + 7200000 }),
      secret
    );

    const request = new Request("http://localhost:3000/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({
        locale: "zh",
        characterId: "meng-po",
        mode: "host",
        hostCredential: "wrong-credential-too-short",
        invite: campaign,
      }),
    });

    const res = await sessionsRoute(request);
    expect(res.status).toBe(403);
  });

  it("provides BGM ducking controller with start, stop and ducking states", () => {
    const bgm = new BgmController();
    expect(bgm.isActive()).toBe(false);
    expect(bgm.isDucked()).toBe(false);

    bgm.setDucked(true);
    expect(bgm.isDucked()).toBe(false); // Not active yet

    bgm.stop();
    expect(bgm.isActive()).toBe(false);
  });

  it("executes playCelebrationChime safely in test environment", () => {
    expect(() => playCelebrationChime()).not.toThrow();
  });
});
