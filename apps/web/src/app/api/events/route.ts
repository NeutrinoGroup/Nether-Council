import { TelemetryEvent } from "@nether/contracts";
import { serverConfig } from "@/shared/server/config";
import { CARD_SHARE_HEADER, cookieToken, readCardShare, readSession, sameOrigin } from "@/shared/server/tickets";
import { forwardTelemetryEvent } from "@/shared/server/data-ingest";
export const runtime = "nodejs";
const cardEvents = new Set<TelemetryEvent["name"]>(["conversation_completed", "card_rendered", "card_download_clicked", "card_download_created", "share_invoked", "invite_copied"]);
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const text = await request.text();
  if (text.length > 2048) return new Response(null, { status: 413 });
  let event;
  try { event = TelemetryEvent.parse(JSON.parse(text)); } catch { return new Response(null, { status: 400 }); }
  // Referral conversion is derived from observed starts and signed context.
  if (event.name === "referred_conversation_started") return new Response(null, { status: 400 });
  const config = serverConfig();
  const explicitShare = request.headers.has(CARD_SHARE_HEADER);
  const claims = explicitShare ? readCardShare(request, config.sessionSecret) : readSession(cookieToken(request), config.sessionSecret);
  if (explicitShare && (!claims || !cardEvents.has(event.name) || claims.campaign.campaignId !== config.campaignId)) return new Response(null, { status: 403 });
  if (event.name !== "entry_viewed" && (!claims || event.sessionId !== claims.session.id)) return new Response(null, { status: 403 });
  const verified: TelemetryEvent = { ...event, at: Date.now(), sessionId: claims?.session.id, campaignId: claims?.campaign.campaignId, mode: claims?.session.mode, characterId: claims?.session.characterId, locale: claims?.session.locale, visitorId: claims?.visitorId, sourceSessionId: claims?.sourceSessionId };
  console.log(JSON.stringify({ channel: "nether.telemetry", version: 1, ...verified }));
  await forwardTelemetryEvent(verified);
  return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
}
