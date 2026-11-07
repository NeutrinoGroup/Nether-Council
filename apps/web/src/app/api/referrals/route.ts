import { z } from "zod";
import { CharacterId, Locale } from "@nether/contracts";
import { readIdentity } from "@/lib/authSession";
import { serverConfig } from "@/shared/server/config";
import { CampaignClaims, cookieToken, readSession, ReferralClaims, sameOrigin, signTicket, verifyTicket } from "@/shared/server/tickets";

export const runtime = "nodejs";
const Input = z.strictObject({ invite: z.string().max(4096).optional(), locale: Locale.optional(), characterId: CharacterId.optional() });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 10000) return new Response(null, { status: 413 });
  let input: z.infer<typeof Input>;
  try {
    const raw = await request.text();
    if (raw.length > 10000) return new Response(null, { status: 413 });
    input = Input.parse(raw.trim() ? JSON.parse(raw) : {});
  } catch { return Response.json({ error: "INVALID_MESSAGE" }, { status: 400 }); }
  const config = serverConfig();
  const claims = readSession(cookieToken(request), config.sessionSecret);
  const now = Date.now();
  let campaign = claims?.campaign ?? (input.invite ? verifyTicket(input.invite, config.campaignSecret, CampaignClaims, now) : undefined);
  let campaignToken = claims ? undefined : input.invite;
  if (!campaign || campaign.campaignId !== config.campaignId || campaign.expiresAt < now + 235_000) {
    let identity;
    try { identity = readIdentity(request); } catch { /* Unconfigured identity signing grants no access. */ }
    if (identity?.kind === "identity") {
      campaign = { kind: "campaign", campaignId: config.campaignId, issuedAt: now, expiresAt: now + 7 * 86_400_000 };
      campaignToken = undefined;
    }
  }
  if (!campaign || campaign.campaignId !== config.campaignId || campaign.expiresAt < now + 235_000) return Response.json({ error: "INVITE_REQUIRED" }, { status: 401 });
  if (config.campaignSecret.length < 32 || (claims && config.referralSecret.length < 32)) return Response.json({ error: "SHARING_UNAVAILABLE" }, { status: 503 });

  const referralToken = claims ? signTicket(ReferralClaims.parse({
    kind: "referral", campaignId: campaign.campaignId, sourceSessionId: claims.session.id,
    issuedAt: now, expiresAt: Math.min(now + 7 * 86_400_000, campaign.expiresAt),
  }), config.referralSecret) : undefined;
  campaignToken ??= signTicket(campaign, config.campaignSecret);

  const origin = new URL(request.url).origin;
  const shareUrl = new URL("/play", origin);
  shareUrl.searchParams.set("invite", campaignToken);
  if (referralToken) shareUrl.searchParams.set("ref", referralToken);
  shareUrl.searchParams.set("character", input.characterId ?? claims?.session.characterId ?? "meng-po");
  shareUrl.searchParams.set("lang", input.locale ?? claims?.session.locale ?? "zh");

  return Response.json({
    referral: referralToken,
    shareUrl: shareUrl.href,
    expiresAt: campaign.expiresAt,
  }, { headers: { "Cache-Control": "no-store" } });
}
