import { serverConfig } from "@/shared/server/config";
import { cookieToken, readSession, ReferralClaims, sameOrigin, signTicket } from "@/shared/server/tickets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  const config = serverConfig();
  const claims = readSession(cookieToken(request), config.sessionSecret);
  if (!claims) return Response.json({ error: "SESSION_EXPIRED" }, { status: 401 });

  const now = Date.now();
  const referralClaims = ReferralClaims.parse({
    kind: "referral",
    campaignId: claims.campaign.campaignId,
    sourceSessionId: claims.session.id,
    issuedAt: now,
    expiresAt: now + 7 * 86_400_000,
  });

  const referralToken = signTicket(referralClaims, config.referralSecret);
  const campaignToken = signTicket(claims.campaign, config.campaignSecret);

  const origin = new URL(request.url).origin;
  const shareUrl = new URL("/play", origin);
  shareUrl.searchParams.set("invite", campaignToken);
  shareUrl.searchParams.set("ref", referralToken);
  shareUrl.searchParams.set("character", claims.session.characterId);
  shareUrl.searchParams.set("lang", claims.session.locale);

  return Response.json({
    referral: referralToken,
    shareUrl: shareUrl.href,
  }, { headers: { "Cache-Control": "no-store" } });
}
