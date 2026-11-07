import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { POST as refer } from "../../apps/web/src/app/api/referrals/route";
import { POST as admit } from "../../apps/web/src/app/api/sessions/route";
import { readSession, signTicket, verifyTicket, ReferralClaims } from "../../apps/web/src/shared/server/tickets";

const secret = "referral-admission-fixture-secret".repeat(2);
const origin = "https://party.test";
const now = 1_800_000_000_000;
const campaign = () => ({ kind: "campaign", campaignId: "pilot", issuedAt: now, expiresAt: now + 3_600_000 });
const request = (path: string, body?: object, cookie = "") => new Request(`${origin}${path}`, { method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const cookieOf = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  for (const key of ["SESSION_SIGNING_SECRET", "CAMPAIGN_SIGNING_SECRET", "REFERRAL_SIGNING_SECRET"]) vi.stubEnv(key, secret);
  vi.stubEnv("NEXT_PUBLIC_CAMPAIGN_ID", "pilot");
  vi.stubEnv("VOICE_ENABLED", "true"); vi.stubEnv("QWEN_DUPLEX_API_KEY", "fixture-not-a-key");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

test("an existing signed invitation survives sharing without login or a voice session", async () => {
  const invite = signTicket(campaign(), secret);
  const shared = await refer(request("/api/referrals", { invite, locale: "en", characterId: "vampire" }));
  expect(shared.status).toBe(200);
  const { shareUrl, expiresAt } = await shared.json();
  const url = new URL(shareUrl);
  expect(url.origin).toBe(origin); expect(url.pathname).toBe("/play");
  expect(url.searchParams.get("invite")).toBe(invite);
  expect(url.searchParams.has("ref")).toBe(false);
  expect(expiresAt).toBe(campaign().expiresAt);
  const friend = await admit(request("/api/sessions", { invite: url.searchParams.get("invite"), locale: url.searchParams.get("lang"), characterId: url.searchParams.get("character") }));
  expect(friend.status).toBe(200);
  const claims = readSession(cookieOf(friend).slice("nc_session=".length), secret);
  expect(claims?.session).toMatchObject({ characterId: "vampire", locale: "en" });
  expect(claims?.sourceSessionId).toBeUndefined();
});

test.each(["missing", "unsigned", "tampered", "expired", "short", "other-campaign"])("%s invitation cannot become paid access through account sharing", async kind => {
  const claims = campaign();
  if (kind === "expired") { claims.issuedAt = now - 1_000; claims.expiresAt = now - 1; }
  if (kind === "short") claims.expiresAt = now + 234_999;
  if (kind === "other-campaign") claims.campaignId = "other";
  const invite = kind === "missing" ? undefined : kind === "unsigned" ? "halloween" : signTicket(claims, kind === "tampered" ? "x".repeat(64) : secret);
  const response = await refer(request("/api/referrals", { invite, locale: "zh" }, "nc_auth=account-does-not-grant-paid-voice"));
  expect(response.status).toBe(401);
  expect(await response.json()).not.toHaveProperty("shareUrl");
});

test("active sessions retain signed source attribution and respect the requested entry locale", async () => {
  const source = await admit(request("/api/sessions", { invite: signTicket(campaign(), secret), locale: "zh", characterId: "meng-po", visitorId: randomUUID() }));
  const { session } = await source.json();
  const cookie = cookieOf(source);
  const shared = await refer(request("/api/referrals", { invite: "halloween", locale: "en", characterId: "vampire" }, cookie));
  expect(shared.status).toBe(200);
  const { shareUrl } = await shared.json();
  const url = new URL(shareUrl);
  expect(url.searchParams.get("lang")).toBe("en");
  expect(url.searchParams.get("character")).toBe("vampire");
  const ref = url.searchParams.get("ref")!;
  expect(verifyTicket(ref, secret, ReferralClaims)?.sourceSessionId).toBe(session.id);
  const friend = await admit(request("/api/sessions", { invite: url.searchParams.get("invite"), ref, locale: "en" }));
  expect(friend.status).toBe(200);
  expect(readSession(cookieOf(friend).slice("nc_session=".length), secret)?.sourceSessionId).toBe(session.id);
  // Existing identity cards still use an empty POST.
  expect((await refer(request("/api/referrals", undefined, cookie))).status).toBe(200);
});

test("cross-origin and invalid payloads cannot mint share links", async () => {
  const body = { invite: signTicket(campaign(), secret), locale: "en" };
  const foreign = new Request(`${origin}/api/referrals`, { method: "POST", headers: { Origin: "https://elsewhere.test" }, body: JSON.stringify(body) });
  expect((await refer(foreign)).status).toBe(403);
  expect((await refer(request("/api/referrals", { ...body, ref: "nc_forged" }))).status).toBe(400);
  expect((await refer(request("/api/referrals", { ...body, invite: "x".repeat(11_000) }))).status).toBe(413);
});
