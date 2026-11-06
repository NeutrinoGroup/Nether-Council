import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { signTicket, verifyTicket } from "@/shared/server/tickets";
import type { NextResponse } from "next/server";
export const AUTH_COOKIE = "nc_identity";
export const FLOW_COOKIE = "nc_google_flow";
const Expiring = { issuedAt: z.number(), expiresAt: z.number() };
const Identity = z.strictObject({ kind: z.literal("identity"), userId: z.string().min(1).max(128), synthetic: z.boolean(), ...Expiring });
const Flow = z.strictObject({ kind: z.literal("google-flow"), state: z.string(), verifier: z.string(), redirectUri: z.string().url(), ...Expiring });
function secret(): string {
  const value = process.env.AUTH_SIGNING_SECRET || process.env.SESSION_SIGNING_SECRET || "";
  if (value.length < 32) throw new Error("AUTH_NOT_CONFIGURED");
  return value;
}
export function readCookie(request: Request, name: string): string {
  return request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}
export function writeCookie(response: NextResponse, name: string, value: string, maxAge: number, request: Request): void {
  response.cookies.set(name, value, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge });
}
export function readIdentity(request: Request) {
  const identity = verifyTicket(readCookie(request, AUTH_COOKIE), secret(), Identity);
  if (identity?.synthetic && process.env.NODE_ENV === "production") return;
  return identity;
}
export function identityToken(userId: string, synthetic: boolean): string {
  const now = Date.now();
  return signTicket({ kind: "identity", userId, synthetic, issuedAt: now, expiresAt: now + 3600000 }, secret());
}
export function createGoogleFlow(redirectUri: string) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const now = Date.now();
  return { state, challenge: createHash("sha256").update(verifier).digest("base64url"), token: signTicket({ kind: "google-flow", state, verifier, redirectUri, issuedAt: now, expiresAt: now + 600000 }, secret()) };
}
export function readGoogleFlow(request: Request) { return verifyTicket(readCookie(request, FLOW_COOKIE), secret(), Flow); }
export function demoEnabled(): boolean { return process.env.NODE_ENV !== "production" && process.env.NETHER_AUTH_DEMO === "true"; }
