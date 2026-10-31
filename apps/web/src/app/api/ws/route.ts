import { upgradeWebSocket } from "@vercel/functions";
import { MAX_MESSAGE_BYTES } from "@nether/contracts";
import { serverConfig } from "@/shared/server/config";
import { cookieToken, readSession, sameOrigin } from "@/shared/server/tickets";
import { relayVoice } from "@/features/voice/server/relay";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const config = serverConfig();
  if (!config.voiceEnabled || !config.realtimeKey) return Response.json({ error: "VOICE_DISABLED" }, { status: 503 });
  if (!sameOrigin(request)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  const claims = readSession(cookieToken(request), config.sessionSecret);
  if (!claims) return Response.json({ error: "SESSION_EXPIRED" }, { status: 401 });
  return upgradeWebSocket(ws => relayVoice(ws, claims.session, config), { maxPayload: MAX_MESSAGE_BYTES });
}
