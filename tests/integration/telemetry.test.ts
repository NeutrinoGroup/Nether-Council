import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import type { TelemetryEvent } from "@nether/contracts";
import { pilotReport } from "../../scripts/lib/telemetry";
const event = { eventId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", name: "share_invoked" as const, at: 1000 };
test("duplicate delivery cannot inflate metrics and a share tap is not completion", () => {
  const report = pilotReport([event, event]);
  expect(report).toMatchObject({ events: 1, duplicates: 1, shareInvoked: 1, conversationsCompleted: 0, referredConversationsStarted: 0 });
});

const source = randomUUID();
const visitor = randomUUID();
const friend = randomUUID();
const started = (sessionId: string, visitorId?: string, sourceSessionId?: string, at = 100): TelemetryEvent => ({
  eventId: randomUUID(), sessionId, visitorId, sourceSessionId, name: "conversation_started", at, campaignId: "pilot",
});

test("new referred visitors require a real start and differ from the observed source visitor", () => {
  const first = started(randomUUID(), friend, source, 200);
  const report = pilotReport([
    started(source, visitor), first, first,
    started(randomUUID(), friend, source, 300), // Another session is still the same visitor.
    started(randomUUID(), visitor, source, 400), // The source tries their own QR.
    { ...started(randomUUID(), randomUUID(), source), name: "referred_conversation_started" },
  ]);
  expect(report).toMatchObject({ conversationsStarted: 4, referredConversationsStarted: 1,
    startedVisitorsEstimate: 2, referredStartsExcludedSelf: 1, referredStartsExcludedReturning: 1,
    referredStartsUnknown: 0, duplicates: 1 });
});

test("source identity gaps and legacy visitors are reported as unknown, not successful referrals", () => {
  const unknownSource = randomUUID();
  const report = pilotReport([
    started(source), started(randomUUID(), friend, source, 200),
    started(randomUUID(), randomUUID(), unknownSource, 210),
    started(randomUUID(), undefined, source, 220),
    { ...started(randomUUID(), randomUUID(), source, 230), campaignId: "another-party" },
    { ...started(randomUUID(), randomUUID(), source, 240), campaignId: undefined },
  ]);
  expect(report).toMatchObject({ referredConversationsStarted: 0, referredStartsUnknown: 5, startedSessionsWithoutVisitor: 2 });
});

test("newness uses the earliest observed start, independent of log delivery order", () => {
  const returning = started(randomUUID(), friend, source, 300);
  const report = pilotReport([returning, started(source, visitor), started(randomUUID(), friend, undefined, 200)]);
  expect(report).toMatchObject({ referredConversationsStarted: 0, referredStartsExcludedReturning: 1 });
});

test("known source metadata can come from another signed event and repeated starts count once", () => {
  const first = started(randomUUID(), friend, source, 200);
  const report = pilotReport([
    { ...started(source, visitor), name: "card_rendered" }, first, { ...first, eventId: randomUUID(), at: 201 },
  ]);
  expect(report).toMatchObject({ conversationsStarted: 1, referredConversationsStarted: 1, referredStartsExcludedReturning: 0 });
});

test("future source evidence cannot prove a referral and campaigns keep their own newness", () => {
  const report = pilotReport([
    started(source, visitor, undefined, 300), started(randomUUID(), friend, source, 200),
    { ...started(randomUUID(), friend, undefined, 100), campaignId: "different-party" },
    { ...started(source, visitor, undefined, 100), campaignId: "another-party" },
    { ...started(randomUUID(), friend, source, 200), campaignId: "another-party" },
  ]);
  expect(report).toMatchObject({ referredConversationsStarted: 1, referredStartsUnknown: 1, referredStartsExcludedReturning: 0 });
});
