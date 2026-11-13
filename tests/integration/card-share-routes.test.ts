import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { POST as admit } from "../../apps/web/src/app/api/sessions/route";
import { POST as refer } from "../../apps/web/src/app/api/referrals/route";
import { POST as record } from "../../apps/web/src/app/api/events/route";
import { POST as verdict } from "../../apps/web/src/app/api/verdict/route";
import { GET as voice } from "../../apps/web/src/app/api/ws/route";
import { ReferralClaims, readSession, signTicket, verifyTicket } from "../../apps/web/src/shared/server/tickets";

vi.mock("@vercel/functions", () => ({ upgradeWebSocket: vi.fn(() => { throw new Error("Unexpected paid connection"); }) }));
const origin = "https://party.test";
const secret = "card-share-test-only-secret".repeat(2);
const startedAt = 1_800_000_000_000;
const upstream = "11111111-1111-4111-8111-111111111111";
const visitor = "22222222-2222-4222-8222-222222222222";
const campaign = (duration = 2 * 86_400_000) => ({ kind: "campaign", campaignId: "pilot", issuedAt: startedAt, expiresAt: startedAt + duration });
const request = (path: string, body: object, cookie = "", capability?: string) => new Request(`${origin}${path}`, { method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json", ...(capability !== undefined ? { "X-Nether-Share": capability } : {}) }, body: JSON.stringify(body) });
const log = vi.spyOn(console, "log").mockImplementation(() => {});
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(startedAt);
  vi.stubEnv("VOICE_ENABLED", "true"); vi.stubEnv("QWEN_DUPLEX_API_KEY", "fixture-only");
  for (const name of ["SESSION_SIGNING_SECRET", "CAMPAIGN_SIGNING_SECRET", "REFERRAL_SIGNING_SECRET"]) vi.stubEnv(name, secret);
  vi.stubEnv("NEXT_PUBLIC_CAMPAIGN_ID", "pilot");
  vi.stubEnv("NETHER_DATA_INGEST_URL", "https://data.test"); vi.stubEnv("NETHER_DATA_INGEST_SECRET", secret);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 202 })));
  log.mockClear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function admission(duration?: number) {
  const invite = signTicket(campaign(duration), secret);
  const ref = signTicket({ kind: "referral", campaignId: "pilot", sourceSessionId: upstream, issuedAt: startedAt, expiresAt: startedAt + 86_400_000 }, secret);
  const response = await admit(request("/api/sessions", { locale: "en", characterId: "meng-po", invite, ref, visitorId: visitor }));
  expect(response.status).toBe(200);
  const body = await response.json();
  return { ...body, cookie: response.headers.get("set-cookie")!.split(";")[0], invite };
}
const cardEvent = (sessionId: string, name = "card_download_created") => ({ eventId: crypto.randomUUID(), sessionId, name, at: 0, sourceSessionId: sessionId, visitorId: upstream, locale: "zh", mode: "host" });

test("admission issues a fixed card capability without extending the paid session", async () => {
  const a = await admission();
  expect(a.share).toMatchObject({ token: expect.any(String), expiresAt: startedAt + 86_400_000 });
  const payload = JSON.parse(Buffer.from(a.share.token.split(".")[0], "base64url").toString());
  expect(payload).toMatchObject({ kind: "share", session: { id: a.session.id, expiresAt: startedAt + 235_000 }, visitorId: visitor, sourceSessionId: upstream });
  expect(a.cookie).not.toContain(a.share.token);
  expect(readSession(a.share.token, secret)).toBeUndefined();
  expect((await admission(600_000)).share.expiresAt).toBe(startedAt + 600_000);
});

test("after 235 seconds cards still share and record events while voice and verdict remain closed", async () => {
  const a = await admission();
  vi.setSystemTime(startedAt + 236_000);
  const shared = await refer(request("/api/referrals", { sessionId: a.session.id }, "", a.share?.token));
  expect(shared.status).toBe(200);
  const data = await shared.json();
  const url = new URL(data.shareUrl);
  expect(verifyTicket(url.searchParams.get("ref")!, secret, ReferralClaims)?.sourceSessionId).toBe(a.session.id);
  expect(data.shareUrl).not.toContain(a.share.token);
  expect([...url.searchParams.keys()].sort()).toEqual(["character", "invite", "lang", "ref"]);
  const response = await record(request("/api/events", cardEvent(a.session.id), "", a.share.token));
  expect(response.status).toBe(202);
  const posted = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
  expect(posted).toMatchObject({ sessionId: a.session.id, sourceSessionId: upstream, visitorId: visitor, locale: "en", mode: "personal" });
  expect(JSON.stringify(log.mock.calls)).not.toContain(a.share.token);
  expect((await voice(new Request(`${origin}/api/ws`, { headers: { Origin: origin, Cookie: a.cookie } }))).status).toBe(401);
  expect((await verdict(request("/api/verdict", { sessionId: a.session.id, turns: [] }, a.cookie))).status).toBe(401);
  expect((await record(request("/api/events", cardEvent(a.session.id, "conversation_started"), a.cookie, a.share.token))).status).toBe(403);
});

test("tab A card authority wins over tab B cookie and missing authority cannot misattribute A to B", async () => {
  const a = await admission(); const b = await admission();
  const shared = await refer(request("/api/referrals", { sessionId: a.session.id }, b.cookie, a.share?.token));
  expect(shared.status).toBe(200);
  const url = new URL((await shared.json()).shareUrl);
  expect(verifyTicket(url.searchParams.get("ref")!, secret, ReferralClaims)?.sourceSessionId).toBe(a.session.id);
  expect((await record(request("/api/events", cardEvent(a.session.id), b.cookie, a.share.token))).status).toBe(202);
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).sessionId).toBe(a.session.id);
  expect((await refer(request("/api/referrals", { sessionId: a.session.id }, b.cookie))).status).toBe(403);
});

test.each(["", "tampered.invalid"])("explicit invalid card authority never falls back to a valid cookie (%s)", async token => {
  const a = await admission();
  expect((await refer(request("/api/referrals", { sessionId: a.session.id }, a.cookie, token))).status).toBe(401);
  expect((await record(request("/api/events", cardEvent(a.session.id), a.cookie, token))).status).toBe(403);
});

test("card capability is limited to matching card events and cannot authorize paid endpoints", async () => {
  const a = await admission();
  expect(a.share?.token).toBeTypeOf("string");
  for (const name of ["card_rendered", "conversation_completed", "card_download_clicked", "card_download_created", "invite_copied", "share_invoked"]) {
    expect((await record(request("/api/events", cardEvent(a.session.id, name), "", a.share.token))).status).toBe(202);
  }
  for (const name of ["entry_viewed", "conversation_started", "connection_error", "latency"]) {
    expect((await record(request("/api/events", cardEvent(a.session.id, name), a.cookie, a.share.token))).status).toBe(403);
  }
  expect((await refer(request("/api/referrals", { sessionId: upstream }, a.cookie, a.share.token))).status).toBe(403);
  expect((await record(request("/api/events", cardEvent(upstream), a.cookie, a.share.token))).status).toBe(403);
  expect((await admit(request("/api/sessions", { locale: "en", invite: a.share.token }))).status).toBe(403);
  expect((await admit(request("/api/sessions", { locale: "en", invite: a.invite }, a.cookie, a.share.token))).status).toBe(403);
  expect((await voice(new Request(`${origin}/api/ws`, { headers: { Origin: origin, Cookie: a.cookie, "X-Nether-Share": a.share.token } }))).status).toBe(403);
  expect((await verdict(request("/api/verdict", { sessionId: a.session.id, turns: [] }, a.cookie, a.share.token))).status).toBe(403);
  expect(readSession(a.share.token, secret)).toBeUndefined();
  expect((await voice(new Request(`${origin}/api/ws`, { headers: { Origin: origin, Cookie: `nc_session=${a.share.token}` } }))).status).toBe(401);
});

test("public referral, expired share, tampering and campaign changes reject without cookie fallback", async () => {
  const a = await admission();
  expect(a.share?.token).toBeTypeOf("string");
  const valid = await refer(request("/api/referrals", { sessionId: a.session.id }, "", a.share.token));
  const referral = new URL((await valid.json()).shareUrl).searchParams.get("ref")!;
  for (const token of [referral, `${a.share.token}x`]) {
    expect((await record(request("/api/events", cardEvent(a.session.id), a.cookie, token))).status).toBe(403);
    expect((await refer(request("/api/referrals", { sessionId: a.session.id }, a.cookie, token))).status).toBe(401);
  }
  vi.stubEnv("NEXT_PUBLIC_CAMPAIGN_ID", "changed");
  expect((await record(request("/api/events", cardEvent(a.session.id), a.cookie, a.share.token))).status).toBe(403);
  vi.stubEnv("NEXT_PUBLIC_CAMPAIGN_ID", "pilot");
  vi.setSystemTime(a.share.expiresAt);
  const b = await admission();
  expect((await refer(request("/api/referrals", { sessionId: a.session.id }, b.cookie, a.share.token))).status).toBe(401);
  expect((await record(request("/api/events", cardEvent(a.session.id), b.cookie, a.share.token))).status).toBe(403);
});
