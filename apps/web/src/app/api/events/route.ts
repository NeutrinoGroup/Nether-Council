import { TelemetryEvent } from "@nether/contracts";
import { serverConfig } from "@/shared/server/config";
import { cookieToken, readSession, sameOrigin } from "@/shared/server/tickets";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const text = await request.text();
  if (text.length > 2048) return new Response(null, { status: 413 });
  let event;
  try { event = TelemetryEvent.parse(JSON.parse(text)); } catch { return new Response(null, { status: 400 }); }
  const claims = readSession(cookieToken(request), serverConfig().sessionSecret);
  if (event.name !== "entry_viewed" && (!claims || event.sessionId !== claims.session.id)) return new Response(null, { status: 403 });
  const verified = { ...event, at: Date.now(), sessionId: claims?.session.id, characterId: claims?.session.characterId, locale: claims?.session.locale, sourceSessionId: claims?.sourceSessionId };
  console.log(JSON.stringify({ channel: "nether.telemetry", version: 1, ...verified }));
  return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
}
