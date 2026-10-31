import { expect, test } from "vitest";
import { pilotReport } from "../../scripts/lib/telemetry";
const event = { eventId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", name: "share_invoked" as const, at: 1000 };
test("duplicate delivery cannot inflate metrics and a share tap is not completion", () => {
  const report = pilotReport([event, event]);
  expect(report).toMatchObject({ events: 1, duplicates: 1, shareInvoked: 1, conversationsCompleted: 0, referredConversationsStarted: 0 });
});
