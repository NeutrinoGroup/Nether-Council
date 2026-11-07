import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { POST as refer } from "../../apps/web/src/app/api/referrals/route";
import { POST as admit } from "../../apps/web/src/app/api/sessions/route";
import { CampaignClaims, readSession, signTicket, verifyTicket, ReferralClaims } from "../../apps/web/src/shared/server/tickets";
import { identityToken } from "../../apps/web/src/lib/authSession";

const secret = "referral-admission-fixture-secret".repeat(2);
const origin = "https://party.test";
const now = 1_800_000_000_000;
const campaign = () => ({ kind: "campaign", campaignId: "pilot", issuedAt: now, expiresAt: now + 3_600_000 });
const request = (path: string, body?: object, cookie = "") => new Request(`${origin}${path}`, { method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const cookieOf = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
const identityCookie = () => `nc_identity=${identityToken("did:nether:google:123", false, { email: "alex@example.test", name: "alex ander", referralCode: "nc_alex" })}`;
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  for (const key of ["AUTH_SIGNING_SECRET", "SESSION_SIGNING_SECRET", "CAMPAIGN_SIGNING_SECRET", "REFERRAL_SIGNING_SECRET"]) vi.stubEnv(key, secret);
  vi.stubEnv("NEXT_PUBLIC_CAMPAIGN_ID", "pilot");
  vi.stubEnv("VOICE_ENABLED", "true"); vi.stubEnv("QWEN_DUPLEX_API_KEY", "fixture-not-a-key");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

test("a signed identity can share a seven-day invitation without an entry invite", async () => {
  const shared = await refer(request("/api/referrals", { locale: "en", characterId: "vampire" }, identityCookie()));
  expect(shared.status).toBe(200);
  expect(shared.headers.get("cache-control")).toBe("no-store");
  const data = await shared.json();
  const url = new URL(data.shareUrl);
  expect(url.origin).toBe(origin);
  expect(url.pathname).toBe("/play");
  expect(url.searchParams.get("character")).toBe("vampire");
  expect(url.searchParams.get("lang")).toBe("en");
  expect(url.searchParams.has("ref")).toBe(false);
  expect(data.referral).toBeUndefined();
  expect(verifyTicket(url.searchParams.get("invite")!, secret, CampaignClaims, now)).toEqual({
    ...campaign(), expiresAt: now + 7 * 86_400_000,
  });
  expect(data.expiresAt).toBe(now + 7 * 86_400_000);
  const friend = await admit(request("/api/sessions", { invite: url.searchParams.get("invite"), locale: "en" }));
  expect(friend.status).toBe(200);
});

test.each([undefined, "", "invalid.signature"])("a signed identity can start a voice session with invite %s", async invite => {
  const admitted = await admit(request("/api/sessions", { invite, locale: "zh" }, identityCookie()));
  expect(admitted.status).toBe(200);
  expect(admitted.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict; Path=/api; Max-Age=235; Secure");
  const { session } = await admitted.json();
  const claims = readSession(cookieOf(admitted).slice("nc_session=".length), secret, now);
  expect(claims?.session).toEqual(session);
  expect(claims?.campaign).toEqual(campaign());
  expect(claims?.sourceSessionId).toBeUndefined();
});

test.each(["", "nc_auth=account-does-not-grant-paid-voice", "nc_identity=forged.signature"])("unauthenticated requests cannot share or start without an invite (%s)", async cookie => {
  const shared = await refer(request("/api/referrals", {}, cookie));
  expect(shared.status).toBe(401);
  expect(await shared.json()).toEqual({ error: "INVITE_REQUIRED" });
  const admitted = await admit(request("/api/sessions", { locale: "zh" }, cookie));
  expect(admitted.status).toBe(403);
  expect(await admitted.json()).toEqual({ error: "FORBIDDEN" });
  expect(admitted.headers.has("set-cookie")).toBe(false);
});

test("sharing without configured identity signing fails closed", async () => {
  vi.stubEnv("AUTH_SIGNING_SECRET", "");
  vi.stubEnv("SESSION_SIGNING_SECRET", "");
  const shared = await refer(request("/api/referrals", {}));
  expect(shared.status).toBe(401);
  expect(await shared.json()).toEqual({ error: "INVITE_REQUIRED" });
});

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
