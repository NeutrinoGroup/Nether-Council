/** Actual Next routes -> signed HTTP envelope -> Python parser, using fixtures only. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { POST as admit } from "../apps/web/src/app/api/sessions/route";
import { POST as refer } from "../apps/web/src/app/api/referrals/route";
import { POST as record } from "../apps/web/src/app/api/events/route";
import { signTicket } from "../apps/web/src/shared/server/tickets";

const origin = "https://party.bridge.invalid";
const endpoint = "https://data.bridge.invalid/v1/events";
const secret = "fixture-telemetry-bridge-secret-32-characters";
const campaignId = "telemetry-bridge-fixture";
Object.assign(process.env, {
  VOICE_ENABLED: "true", QWEN_DUPLEX_API_KEY: "fixture-provider-key",
  SESSION_SIGNING_SECRET: secret, CAMPAIGN_SIGNING_SECRET: secret,
  REFERRAL_SIGNING_SECRET: secret, HOST_ACCESS_SECRET: secret,
  NEXT_PUBLIC_CAMPAIGN_ID: campaignId,
  NETHER_DATA_INGEST_URL: "https://data.bridge.invalid", NETHER_DATA_INGEST_SECRET: secret,
  VOICE_GATEWAY_URL: "", VOICE_GATEWAY_SECRET: "fixture-gateway-key",
  QWEN_REALTIME_URL: "wss://provider.bridge.invalid", QWEN_REALTIME_MODEL: "fixture",
  QWEN_TEXT_API_KEY: "fixture-text-key", QWEN_TEXT_BASE_URL: "https://text.bridge.invalid",
  QWEN_TEXT_MODEL: "fixture",
});

const request = (path: string, body: object, cookie = "") => new Request(`${origin}${path}`, {
  method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const cookieOf = (response: Response) => {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert(cookie?.startsWith("nc_session="), "Admission must return a signed session cookie");
  return cookie;
};
type Envelope = { body: string; timestamp: string; signature: string };
const envelopes: Envelope[] = [];
const logs: unknown[][] = [];
const warnings: unknown[][] = [];
const savedFetch = globalThis.fetch;
const savedLog = console.log;
const savedWarn = console.warn;
let unexpectedFetch = false;
let stage = "route admission";

const python = `
import json, sys
from nether_data.ingest import parse_event, valid_signature

fixture = json.load(sys.stdin)
for envelope, expected in zip(fixture["envelopes"], fixture["expected"], strict=True):
    body = envelope["body"].encode()
    args = (envelope["timestamp"], envelope["signature"], fixture["secret"])
    assert valid_signature(body, *args)
    assert not valid_signature(body + b" ", *args)
    payload = json.loads(body)
    parsed = parse_event(payload)
    assert parsed is not None
    assert parsed.event_type == "conversation_started"
    assert str(parsed.event_id) == expected["event_id"]
    assert str(parsed.call.id) == expected["call_id"]
    assert parsed.call.campaign_id == expected["campaign_id"]
    assert parsed.call.character_id == expected["character_id"]
    assert parsed.call.locale == expected["locale"]
    assert parsed.call.mode == expected["mode"]
    for field in ("visitor_id", "source_session_id"):
        value = getattr(parsed.call, field)
        assert (str(value) if value is not None else None) == expected[field]
    keys = {"eventId", "sessionId", "name", "at", "campaignId", "characterId", "locale", "mode"}
    if expected["visitor_id"] is not None:
        keys.add("visitorId")
    if expected["source_session_id"] is not None:
        keys.add("sourceSessionId")
    assert set(payload) == keys
print(json.dumps({"verified": len(fixture["envelopes"]), "tamperedRejected": len(fixture["envelopes"])}))
`;

try {
  console.log = (...args: unknown[]) => { logs.push(args); };
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  globalThis.fetch = async (input, init) => {
    if (String(input) !== endpoint || init?.method !== "POST" || typeof init.body !== "string") {
      unexpectedFetch = true;
      throw new Error("Unexpected external request");
    }
    const headers = new Headers(init.headers);
    envelopes.push({ body: init.body, timestamp: headers.get("x-nether-timestamp") ?? "", signature: headers.get("x-nether-signature") ?? "" });
    return new Response(null, { status: 202 });
  };
  const now = Date.now();
  const invite = signTicket({ kind: "campaign", campaignId, issuedAt: now, expiresAt: now + 900_000 }, secret);
  const visitorId = randomUUID();
  const friendId = randomUUID();
  const source = await admit(request("/api/sessions", { locale: "en", characterId: "meng-po", mode: "host", hostCredential: secret, invite, visitorId }));
  assert.equal(source.status, 200);
  const { session: sourceSession } = await source.json();
  const sourceCookie = cookieOf(source);

  stage = "signed referral admission";
  const referral = await refer(request("/api/referrals", {}, sourceCookie));
  assert.equal(referral.status, 200);
  const shareUrl = new URL((await referral.json()).shareUrl);
  const friend = await admit(request("/api/sessions", {
    locale: "zh", characterId: "zhong-kui", invite: shareUrl.searchParams.get("invite"),
    ref: shareUrl.searchParams.get("ref"), visitorId: friendId,
  }));
  assert.equal(friend.status, 200);
  const { session: friendSession } = await friend.json();
  const legacy = await admit(request("/api/sessions", { locale: "en", characterId: "vampire", invite }));
  assert.equal(legacy.status, 200);
  const { session: legacySession } = await legacy.json();

  stage = "server identity binding";
  const cases = [
    { session: sourceSession, cookie: sourceCookie, visitor: visitorId, source: null },
    { session: friendSession, cookie: cookieOf(friend), visitor: friendId, source: sourceSession.id },
    { session: legacySession, cookie: cookieOf(legacy), visitor: null, source: null },
  ];
  const expected = [];
  for (const item of cases) {
    const eventId = randomUUID();
    const response = await record(request("/api/events", {
      eventId, sessionId: item.session.id, name: "conversation_started", at: 0,
      campaignId: "forged-campaign", characterId: "werewolf", locale: "zh", mode: "personal",
      visitorId: randomUUID(), sourceSessionId: randomUUID(),
    }, item.cookie));
    assert.equal(response.status, 202);
    expected.push({
      event_id: eventId, call_id: item.session.id, campaign_id: campaignId,
      character_id: item.session.characterId, locale: item.session.locale, mode: item.session.mode,
      visitor_id: item.visitor, source_session_id: item.source,
    });
  }
  assert.equal(unexpectedFetch, false);
  assert.equal(warnings.length, 0);
  assert.equal(envelopes.length, 3);
  assert.equal(logs.length, 3);
  for (const [index, args] of logs.entries()) {
    assert.equal(args.length, 1);
    assert.equal(typeof args[0], "string");
    const { channel, version, ...logged } = JSON.parse(String(args[0]));
    assert.equal(channel, "nether.telemetry");
    assert.equal(version, 1);
    assert.deepEqual(logged, JSON.parse(envelopes[index].body));
  }

  stage = "Python HMAC and parser contract";
  const result = execFileSync("uv", ["run", "--project", "services/data", "--frozen", "--no-sync", "python", "-c", python], {
    input: JSON.stringify({ secret, envelopes, expected }), encoding: "utf8", timeout: 15_000,
    stdio: ["pipe", "pipe", "pipe"],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, UV_OFFLINE: "true" },
  });
  assert.deepEqual(JSON.parse(result), { verified: 3, tamperedRejected: 3 });
} catch {
  process.stderr.write(`FAIL: telemetry bridge at ${stage}.\n`);
  process.exitCode = 1;
} finally {
  globalThis.fetch = savedFetch;
  console.log = savedLog;
  console.warn = savedWarn;
}
if (!process.exitCode) console.log("PASS: Next admission/referral/events -> Python HMAC/parser; signed campaign, mode, visitor/source; legacy optional identity; tampered body rejected.");
