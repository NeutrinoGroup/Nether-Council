import { afterEach, expect, test, vi } from "vitest";
import { getVisitorId } from "../../apps/web/src/features/analytics/visitor";

afterEach(() => vi.unstubAllGlobals());

test("visitor identity persists as a random UUID on this device", () => {
  const items = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value) });
  const first = getVisitorId();
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(items.get("nc_visitor_id")).toBe(first);
  expect(getVisitorId()).toBe(first);
});

test("an existing valid visitor identity is reused without a write", () => {
  const id = "12345678-1234-4234-8234-123456789abc";
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { getItem: () => id, setItem });
  expect(getVisitorId()).toBe(id);
  expect(setItem).not.toHaveBeenCalled();
});

test("invalid persisted data is replaced with a UUID", () => {
  let value = "a nickname is not an anonymous visitor ID";
  vi.stubGlobal("localStorage", { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } });
  const id = getVisitorId();
  expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(value).toBe(id);
});

test.each(["read", "write", "discard"])("unavailable storage (%s) never invents a persistent identity", mode => {
  vi.stubGlobal("localStorage", {
    getItem: () => { if (mode === "read") throw new DOMException("blocked", "SecurityError"); return null; },
    setItem: () => { if (mode === "write") throw new DOMException("full", "QuotaExceededError"); },
  });
  expect(getVisitorId()).toBeUndefined();
  expect(getVisitorId()).toBeUndefined();
});

test("server rendering without localStorage does not invent an identity", () => {
  vi.stubGlobal("localStorage", undefined);
  expect(getVisitorId()).toBeUndefined();
});
