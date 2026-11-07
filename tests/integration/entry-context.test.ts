import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { consumeEntryContext, readEntryQuery, rememberEntryContext } from "../../apps/web/src/features/auth/entry-context";

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());

test("OAuth restores only bounded invitation context once as a relative URL", () => {
  const at = 1_000_000;
  rememberEntryContext({ pathname: "/play", search: "?invite=campaign.signature&ref=source.signature&character=zhong-kui&lang=en&hostCredential=secret&returnURL=https://evil.test&code=oauth-secret" }, at);
  const raw = storage.get("nc_entry_context")!;
  expect(raw).not.toContain("secret"); expect(raw).not.toContain("evil.test");
  const restored = consumeEntryContext(at + 599_999)!;
  const url = new URL(restored, "https://party.test");
  expect(restored.startsWith("/play?")).toBe(true);
  expect(url.origin).toBe("https://party.test");
  expect(Object.fromEntries(url.searchParams)).toEqual({ invite: "campaign.signature", ref: "source.signature", character: "zhong-kui", lang: "en" });
  expect(consumeEntryContext(at + 600_000)).toBeUndefined();
});

test("entry fields discard oversized or invalid values and never keep arbitrary parameters", () => {
  expect(readEntryQuery(`?invite=${"x".repeat(4097)}&ref=${"y".repeat(4097)}&character=not-a-character&lang=fr&hostCredential=secret`)).toEqual({});
  expect(readEntryQuery(`?invite=${"x".repeat(4096)}&ref=abc&character=meng-po&lang=zh`)).toEqual({ invite: "x".repeat(4096), ref: "abc", character: "meng-po", lang: "zh" });
});

test.each(["//evil.test", "https://evil.test", "/host", "/play/../host", "/\\evil.test"])("OAuth never remembers an unsupported return path %s", path => {
  rememberEntryContext({ pathname: path, search: "?invite=signed.invite" }, 1000);
  expect(consumeEntryContext(1001)).toBeUndefined();
});

test.each([600_001, -1])("expired or future context is discarded (%s ms)", age => {
  rememberEntryContext({ pathname: "/", search: "?invite=signed.invite&lang=zh" }, 1_000_000);
  expect(consumeEntryContext(1_000_000 + age)).toBeUndefined();
  expect(storage.size).toBe(0);
});

test("tampered external path and malformed records are consumed without navigation", () => {
  for (const raw of ["not json", JSON.stringify({ path: "https://evil.test", query: { invite: "a.b" }, savedAt: 1000 }), JSON.stringify({ path: "/", query: { returnURL: "https://evil.test" }, savedAt: 1000 })]) {
    storage.set("nc_entry_context", raw);
    expect(consumeEntryContext(1001)).toBeUndefined();
    expect(storage.size).toBe(0);
  }
});

test("storage denial does not prevent login or invent a return URL", () => {
  vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
  expect(() => rememberEntryContext({ pathname: "/", search: "?invite=a.b" }, 1000)).not.toThrow();
  expect(consumeEntryContext(1001)).toBeUndefined();
});
