import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TelemetryEvent } from "@nether/contracts";
import { POST as admit } from "../../apps/web/src/app/api/sessions/route";
import { POST as refer } from "../../apps/web/src/app/api/referrals/route";
import { POST as record } from "../../apps/web/src/app/api/events/route";
import { readSession, signTicket } from "../../apps/web/src/shared/server/tickets";

const origin = "https://party.test";
const secret = "test-only-secret".repeat(3);
const visitorId = "11111111-1111-4111-8111-111111111111";
const friendId = "22222222-2222-4222-8222-222222222222";
const campaign = () => ({ kind: "campaign", campaignId: "pilot", issuedAt: Date.now(), expiresAt: Date.now() + 900_000 });
const request = (path: string, body: object, cookie = "") => new Request(`${origin}${path}`, { method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const log = vi.spyOn(console, "log").mockImplementation(() => {});
beforeEach(() => {
  vi.stubEnv("VOICE_ENABLED", "true"); vi.stubEnv("QWEN_DUPLEX_API_KEY", "fixture-not-a-key");
  for (const key of ["SESSION_SIGNING_SECRET", "CAMPAIGN_SIGNING_SECRET", "REFERRAL_SIGNING_SECRET"]) vi.stubEnv(key, secret);
  vi.stubEnv("NEXT_PUBLIC_CAMPAIGN_ID", "pilot");
  vi.stubEnv("NETHER_DATA_INGEST_URL", "https://data.test"); vi.stubEnv("NETHER_DATA_INGEST_SECRET", secret);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 202 })));
  log.mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("signed invite carries source identity into a complete Python ingestion envelope", async () => {
  const invitation = signTicket(campaign(), secret);
  const source = await admit(request("/api/sessions", { locale: "en", characterId: "meng-po", invite: invitation, visitorId }));
  expect(source.status).toBe(200);
  const { session } = await source.json();
  const sourceCookie = source.headers.get("set-cookie")!.split(";")[0];
  expect(readSession(sourceCookie.slice("nc_session=".length), secret)?.visitorId).toBe(visitorId);
  const referral = await refer(request("/api/referrals", {}, sourceCookie));
  expect(referral.status).toBe(200);
  const url = new URL((await referral.json()).shareUrl);
  const friend = await admit(request("/api/sessions", { locale: "zh", characterId: "zhong-kui", invite: url.searchParams.get("invite"), ref: url.searchParams.get("ref"), visitorId: friendId }));
  expect(friend.status).toBe(200);
  const { session: friendSession } = await friend.json();
  const cookie = friend.headers.get("set-cookie")!.split(";")[0];
  const event = { eventId: crypto.randomUUID(), sessionId: friendSession.id, name: "conversation_started", at: 0, campaignId: "forged", visitorId, sourceSessionId: friendSession.id, mode: "host", characterId: "vampire", locale: "en" };
  expect((await record(request("/api/events", event, cookie))).status).toBe(202);
  const posted = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
  expect(posted).toMatchObject({ campaignId: "pilot", mode: "personal", characterId: "zhong-kui", locale: "zh", visitorId: friendId, sourceSessionId: session.id });
  expect(TelemetryEvent.parse(posted)).toEqual(posted);
  const logged = JSON.parse(String(log.mock.calls[0][0]));
  delete logged.channel; delete logged.version;
  expect(TelemetryEvent.parse(logged)).toEqual(posted);
});

test("legacy client context is cleared and unknown referral events cannot fake new users", async () => {
  const response = await admit(request("/api/sessions", { locale: "en", invite: signTicket(campaign(), secret) }));
  const { session } = await response.json();
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const event = { eventId: crypto.randomUUID(), sessionId: session.id, name: "conversation_started", at: 0, visitorId, sourceSessionId: friendId };
  expect((await record(request("/api/events", event, cookie))).status).toBe(202);
  const posted = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
  expect(posted).not.toHaveProperty("visitorId"); expect(posted).not.toHaveProperty("sourceSessionId");
  expect((await record(request("/api/events", { ...event, name: "referred_conversation_started" }, cookie))).status).toBe(400);
});

test("expired invitations and a closed voice switch never admit a paid session", async () => {
  const expired = signTicket({ ...campaign(), issuedAt: Date.now() - 900_000, expiresAt: Date.now() - 1 }, secret);
  expect((await admit(request("/api/sessions", { locale: "en", invite: expired, visitorId }))).status).toBe(403);
  vi.stubEnv("VOICE_ENABLED", "false");
  expect((await admit(request("/api/sessions", { locale: "en", invite: signTicket(campaign(), secret), visitorId }))).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
