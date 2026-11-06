import { expect, test } from "vitest";
import { assessLoad, type ClientEvidence } from "../../scripts/lib/load-evidence";

const clients = (window: (id: number) => ClientEvidence["connections"]): ClientEvidence[] =>
  Array.from({ length: 10 }, (_, id) => ({ clientId: id, turnsAttempted: 3, turnsSucceeded: 3, connections: window(id) }));

test("ten short staggered clients cannot pass by leaving the test process open for 120 seconds", () => {
  // Reproduces the previous runner: each connection lasts ~30 seconds; starts span 70 seconds.
  const result = assessLoad(clients(id => [{ readyAtMs: id * 7_778, closedAtMs: id * 7_778 + 32_000 }]));
  expect(result.totalTurnsSucceeded).toBe(30);
  expect(result.commonReadyMs).toBe(0);
  expect(result.durationRequirementMet).toBe(false);
  expect(result.targetAchieved).toBe(false);
});

test("measures overlap from the latest readiness until the earliest close", () => {
  const result = assessLoad(clients(id => [{ readyAtMs: id * 100, closedAtMs: 121_000 + id * 100 }]));
  expect(result.commonReadyMs).toBe(120_100);
  expect(result.targetAchieved).toBe(true);
});

test("reconnecting twice for 60 seconds does not become one uninterrupted two-minute connection", () => {
  const result = assessLoad(clients(() => [{ readyAtMs: 0, closedAtMs: 60_000 }, { readyAtMs: 60_000, closedAtMs: 120_000 }]));
  expect(result.commonReadyMs).toBe(60_000);
  expect(result.targetAchieved).toBe(false);
});

test("supports recovery when all ten later establish a full common interval", () => {
  const result = assessLoad(clients(() => [{ readyAtMs: 0, closedAtMs: 5_000 }, { readyAtMs: 6_000, closedAtMs: 126_000 }]));
  expect(result.targetAchieved).toBe(true);
});

test("missing, invalid, or duplicate-client evidence cannot certify ten clients", () => {
  const missing = clients(() => []);
  expect(assessLoad(missing).targetAchieved).toBe(false);
  const invalid = clients(() => [{ readyAtMs: NaN, closedAtMs: Infinity }]);
  expect(assessLoad(invalid).targetAchieved).toBe(false);
  const duplicate = clients(() => [{ readyAtMs: 0, closedAtMs: 120_000 }]);
  duplicate[9].clientId = 8;
  expect(assessLoad(duplicate).targetAchieved).toBe(false);
  expect(assessLoad(duplicate.slice(0, 9)).targetAchieved).toBe(false);
});

test("29 of exactly 30 planned turns passes, 28 or a reduced-duration smoke does not", () => {
  const evidence = clients(() => [{ readyAtMs: 0, closedAtMs: 120_000 }]);
  evidence[0].turnsSucceeded = 2;
  expect(assessLoad(evidence).targetAchieved).toBe(true);
  evidence[1].turnsSucceeded = 2;
  expect(assessLoad(evidence).targetAchieved).toBe(false);
  expect(assessLoad(clients(() => [{ readyAtMs: 0, closedAtMs: 10_000 }]), 10_000).targetAchieved).toBe(false);
});
