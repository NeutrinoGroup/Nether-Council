import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { POST } from "@/app/api/auth/google/exchange/route";
import { GET, DELETE } from "@/app/api/auth/session/route";
import { GET as start } from "@/app/api/auth/google/start/route";
import { AUTH_COOKIE, FLOW_COOKIE, createGoogleFlow, identityToken } from "@/lib/authSession";
import { clearMemoryUsersForTests, generateReferralCode, syncUserToDatabase } from "@/lib/userDb";
const origin = "https://example.test";
function exchange(body: unknown, cookie = "", from = origin) {
  return POST(new Request(`${origin}/api/auth/google/exchange`, { method: "POST", headers: { "content-type": "application/json", origin: from, cookie }, body: JSON.stringify(body) }));
}
beforeEach(() => {
  vi.stubEnv("AUTH_SIGNING_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("NETHER_AUTH_DEMO", "true"); vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", randomBytes(16).toString("hex")); clearMemoryUsersForTests();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
test("query userId cannot impersonate an authenticated session", async () => {
  const response = await GET(new Request(`${origin}/api/auth/session?userId=another-user`));
  expect(await response.json()).toEqual({ authenticated: false });
});
test("production never accepts demo identity", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect((await exchange({ id_token: "demo_verified_google_identity" })).status).toBe(403);
});
test("cross-origin exchange and logout are denied", async () => {
  expect((await exchange({ id_token: "demo_verified_google_identity" }, "", "https://evil.test")).status).toBe(403);
  expect(DELETE(new Request(`${origin}/api/auth/session`, { method: "DELETE" })).status).toBe(403);
});
test("mismatched or missing OAuth state is rejected before upstream fetch", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); const flow = createGoogleFlow(origin);
  expect((await exchange({ code: "test-code", state: "wrong-state" }, `${FLOW_COOKIE}=${flow.token}`)).status).toBe(400);
  expect((await exchange({ code: "test-code", state: flow.state })).status).toBe(400); expect(fetch).not.toHaveBeenCalled();
});
test("signed OAuth flow binds PKCE verifier and redirect to server origin", async () => {
  const flow = createGoogleFlow(origin);
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "test-access" })).mockResolvedValueOnce(Response.json({ sub: "12345", email: "visitor@example.test", email_verified: true, name: "Visitor" }));
  vi.stubGlobal("fetch", fetch);
  const result = await exchange({ code: "test-code", state: flow.state }, `${FLOW_COOKIE}=${flow.token}`);
  expect(result.status).toBe(200); const options = fetch.mock.calls[0][1];
  expect(options.body.get("code_verifier")).toBeTruthy(); expect(options.body.get("redirect_uri")).toBe(origin);
  const cookie = result.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=lax");
  const token = cookie.match(/nc_identity=([^;]+)/)![1];
  const session = await GET(new Request(`${origin}/api/auth/session?userId=attacker`, { headers: { cookie: `${AUTH_COOKIE}=${token}` } }));
  expect((await session.json()).profile.id).toBe("did:nether:google:12345");
});
test("unverified Google email cannot create a session", async () => {
  const flow = createGoogleFlow(origin);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ access_token: "test-access" })).mockResolvedValueOnce(Response.json({ sub: "12345", email: "visitor@example.test", email_verified: false })));
  const result = await exchange({ code: "test-code", state: flow.state }, `${FLOW_COOKIE}=${flow.token}`);
  expect(result.status).toBe(401); expect(result.headers.get("set-cookie")).toBeNull();
});
test("tampered session is rejected and logout clears browser cookie", async () => {
  const token = identityToken("user", false);
  const result = await GET(new Request(`${origin}/api/auth/session`, { headers: { cookie: `${AUTH_COOKIE}=${token}tamper` } }));
  expect((await result.json()).authenticated).toBe(false);
  const logout = DELETE(new Request(`${origin}/api/auth/session`, { method: "DELETE", headers: { origin } }));
  expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
});
test("production OAuth exchange succeeds without optional Supabase and survives serverless cold start", async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  const flow = createGoogleFlow(origin);
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "test-access" })).mockResolvedValueOnce(Response.json({ sub: "998877", email: "oodaleek@gmail.com", email_verified: true, name: "Alexander", picture: "https://lh3.googleusercontent.com/a/avatar" }));
  vi.stubGlobal("fetch", fetch);
  const result = await exchange({ code: "test-code", state: flow.state }, `${FLOW_COOKIE}=${flow.token}`);
  expect(result.status).toBe(200);
  const token = result.headers.get("set-cookie")!.match(/nc_identity=([^;]+)/)![1];
  clearMemoryUsersForTests();
  const session = await GET(new Request(`${origin}/api/auth/session`, { headers: { cookie: `${AUTH_COOKIE}=${token}` } }));
  expect(session.status).toBe(200);
  const body = await session.json();
  expect(body.authenticated).toBe(true);
  expect(body.profile.id).toBe("did:nether:google:998877");
  expect(body.profile.email).toBe("oodaleek@gmail.com");
  expect(body.profile.referralCode).toBe(generateReferralCode("did:nether:google:998877"));
});
test("missing database fails closed when SUPABASE_REQUIRED is enabled", async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SUPABASE_REQUIRED", "true"); vi.stubEnv("SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  await expect(syncUserToDatabase({ id: "user", email: "u@example.test", name: "User" })).rejects.toThrow("DATABASE_UNAVAILABLE");
});
test("referral codes are stable and distinct for identities", () => {
  expect(generateReferralCode("a")).toBe(generateReferralCode("a")); expect(generateReferralCode("a")).not.toBe(generateReferralCode("b"));
});
test("OAuth start issues independent state and PKCE challenge", () => {
  const a = start(new Request(`${origin}/api/auth/google/start`)); const b = start(new Request(`${origin}/api/auth/google/start`));
  const aURL = new URL(a.headers.get("location")!); const bURL = new URL(b.headers.get("location")!);
  expect(aURL.searchParams.get("state")).not.toBe(bURL.searchParams.get("state"));
  expect(aURL.searchParams.get("code_challenge_method")).toBe("S256"); expect(a.headers.get("set-cookie")).toContain("HttpOnly");
});
