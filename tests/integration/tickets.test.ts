import { expect, test } from "vitest";
import { CampaignClaims, ReferralClaims, SessionClaims, readSession, signTicket, verifyTicket } from "../../apps/web/src/shared/server/tickets";
const secret = "s".repeat(32);
const campaign = { kind: "campaign", campaignId: "pilot", issuedAt: 1000, expiresAt: 600000 } as const;
const session = { id: "11111111-1111-4111-8111-111111111111", characterId: "meng-po", locale: "zh", mode: "personal", createdAt: 2000, captureUntil: 182000, expiresAt: 237000 };
test("signatures reject tampering, short keys, expiry and referral-as-admission", () => {
  const token = signTicket(campaign, secret);
  expect(verifyTicket(token, secret, CampaignClaims, 2000)?.campaignId).toBe("pilot");
  expect(verifyTicket(token, "x".repeat(32), CampaignClaims, 2000)).toBeUndefined();
  expect(verifyTicket(token, secret, CampaignClaims, 600000)).toBeUndefined();
  const tampered = Buffer.from(JSON.stringify({ ...campaign, expiresAt: 999999 })).toString("base64url") + "." + token.split(".")[1];
  expect(verifyTicket(tampered, secret, CampaignClaims, 2000)).toBeUndefined();
  expect(() => signTicket(campaign, "short")).toThrow();
  const referral = signTicket({ ...campaign, kind: "referral", sourceSessionId: session.id }, secret);
  expect(verifyTicket(referral, secret, ReferralClaims, 2000)).toBeDefined();
  expect(verifyTicket(referral, secret, CampaignClaims, 2000)).toBeUndefined();
});
test("session deadline is signed, bounded, and contained in the campaign window", () => {
  const claims = { kind: "session", session, campaign, issuedAt: 2000, expiresAt: 237000 };
  expect(readSession(signTicket(claims, secret), secret, 3000)?.session.id).toBe(session.id);
  expect(readSession(signTicket({ ...claims, expiresAt: 300000 }, secret), secret, 3000)).toBeUndefined();
  expect(readSession(signTicket({ ...claims, campaign: { ...campaign, expiresAt: 10000 } }, secret), secret, 3000)).toBeUndefined();
  expect(verifyTicket(signTicket({ ...claims, session: { ...session, expiresAt: 999999 } }, secret), secret, SessionClaims, 3000)).toBeUndefined();
});
