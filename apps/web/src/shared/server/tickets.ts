import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Session } from "@nether/contracts";
const Expiring = { issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative() };
export const CampaignClaims = z.strictObject({ kind: z.literal("campaign"), campaignId: z.string().min(1).max(80), ...Expiring });
export const ReferralClaims = z.strictObject({ kind: z.literal("referral"), campaignId: z.string().min(1).max(80), sourceSessionId: z.uuid(), ...Expiring });
export const SessionClaims = z.strictObject({ kind: z.literal("session"), session: Session, campaign: CampaignClaims, sourceSessionId: z.uuid().optional(), ...Expiring });
export type SessionClaims = z.infer<typeof SessionClaims>;
function digest(payload: string, secret: string) {
  if (secret.length < 32) throw new Error("SIGNING_SECRET_MISSING");
  return createHmac("sha256", secret).update(payload).digest();
}
export function signTicket(claims: unknown, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${digest(payload, secret).toString("base64url")}`;
}
export function verifyTicket<T>(token: string, secret: string, schema: z.ZodType<T>, now = Date.now()): T | undefined {
  try {
    if (token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return;
    const [payload, signature] = token.split(".");
    const expected = digest(payload, secret); const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt) || value.issuedAt > now + 5000 || value.expiresAt <= now || value.expiresAt <= value.issuedAt) return;
    return schema.parse(value);
  } catch { return; }
}
export function readSession(token: string, secret: string, now = Date.now()) {
  const claims = verifyTicket(token, secret, SessionClaims, now);
  if (!claims || claims.session.expiresAt !== claims.expiresAt || claims.session.createdAt !== claims.issuedAt || claims.campaign.expiresAt < claims.expiresAt) return;
  return claims;
}
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}
export function cookieToken(request: Request): string {
  const pair = request.headers.get("cookie")?.split(";").map(p => p.trim()).find(p => p.startsWith("nc_session="));
  return pair?.slice("nc_session=".length) ?? "";
}
