import { afterEach, beforeEach, expect, test, vi } from "vitest";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
let stored: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  stored = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test("session-specific capabilities survive a module reload without crossing cards", async () => {
  const { rememberCardShare } = await import("../../apps/web/src/features/card/share-access");
  rememberCardShare(id, { token: "source.private-token", expiresAt: Date.now() + 600_000 });
  rememberCardShare(otherId, { token: "other.private-token", expiresAt: Date.now() + 900_000 });
  vi.resetModules();
  const { cardShareHeaders } = await import("../../apps/web/src/features/card/share-access");
  expect(cardShareHeaders(id)).toEqual({ "X-Nether-Share": "source.private-token" });
  expect(cardShareHeaders(otherId)).toEqual({ "X-Nether-Share": "other.private-token" });
  expect(cardShareHeaders(crypto.randomUUID())).toEqual({});
});

test("blocked browser storage retains a capability in memory until its absolute deadline", async () => {
  vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
  const { rememberCardShare, cardShareHeaders } = await import("../../apps/web/src/features/card/share-access");
  rememberCardShare(id, { token: "source.private-token", expiresAt: Date.now() + 600_000 });
  await vi.advanceTimersByTimeAsync(235_001);
  expect(cardShareHeaders(id)).toEqual({ "X-Nether-Share": "source.private-token" });
  await vi.advanceTimersByTimeAsync(364_999);
  expect(cardShareHeaders(id)).toEqual({});
});

test.each([
  undefined, {}, { token: "bad\nheader", expiresAt: Date.now() + 600_000 },
  { token: "valid.token", expiresAt: -1 }, { token: "x".repeat(4097), expiresAt: Date.now() + 600_000 },
])("malformed capability is never added to request headers: %j", async value => {
  const { rememberCardShare, cardShareHeaders } = await import("../../apps/web/src/features/card/share-access");
  rememberCardShare(id, value);
  expect(cardShareHeaders(id)).toEqual({});
});

test("expired or transplanted stored capabilities are rejected and removed", async () => {
  stored.set(`nc_card_share_${id}`, JSON.stringify({ sessionId: otherId, token: "source.private-token", expiresAt: Date.now() + 600_000 }));
  const { cardShareHeaders } = await import("../../apps/web/src/features/card/share-access");
  expect(cardShareHeaders(id)).toEqual({});
  expect(stored.has(`nc_card_share_${id}`)).toBe(false);
  stored.set(`nc_card_share_${id}`, JSON.stringify({ sessionId: id, token: "source.private-token", expiresAt: Date.now() }));
  expect(cardShareHeaders(id)).toEqual({});
  expect(stored.has(`nc_card_share_${id}`)).toBe(false);
});
