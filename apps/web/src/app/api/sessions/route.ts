import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CharacterId, Locale } from "@nether/contracts";
import { serverConfig } from "@/shared/server/config";
import { CampaignClaims, ReferralClaims, sameOrigin, signTicket, verifyTicket } from "@/shared/server/tickets";
export const runtime = "nodejs";
const Input = z.strictObject({ locale: Locale, characterId: CharacterId.default("meng-po"), mode: z.enum(["personal", "host"]).default("personal"), invite: z.string().max(4096), ref: z.string().max(4096).optional(), hostCredential: z.string().max(256).optional() });
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 10000) return new Response(null, { status: 413 });
  const config = serverConfig();
  if (!config.voiceEnabled || !config.realtimeKey || config.sessionSecret.length < 32) return Response.json({ error: "VOICE_DISABLED" }, { status: 503 });
  let input: z.infer<typeof Input>;
  try { const raw = await request.text(); if (raw.length > 10000) throw new Error(); input = Input.parse(JSON.parse(raw)); } catch { return Response.json({ error: "INVALID_MESSAGE" }, { status: 400 }); }
  const now = Date.now();
  const campaign = verifyTicket(input.invite, config.campaignSecret, CampaignClaims, now);
  if (!campaign || campaign.campaignId !== config.campaignId || campaign.expiresAt < now + 235_000) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (input.mode === "host") {
    const given = Buffer.from(input.hostCredential ?? ""); const actual = Buffer.from(config.hostSecret);
    if (actual.length < 32 || given.length !== actual.length || !timingSafeEqual(given, actual)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const referral = input.ref ? verifyTicket(input.ref, config.referralSecret, ReferralClaims, now) : undefined;
  const sourceSessionId = referral?.campaignId === campaign.campaignId ? referral.sourceSessionId : undefined;
  const session = { id: randomUUID(), characterId: input.characterId, locale: input.locale, mode: input.mode, createdAt: now, captureUntil: now + 180_000, expiresAt: now + 235_000 };
  const ticket = signTicket({ kind: "session", session, campaign, ...(sourceSessionId ? { sourceSessionId } : {}), issuedAt: now, expiresAt: session.expiresAt }, config.sessionSecret);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return Response.json({ session }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `nc_session=${ticket}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=235${secure}` } });
}
