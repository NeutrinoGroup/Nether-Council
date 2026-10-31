export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ ok: true, protocolVersion: 1, voiceEnabled: process.env.VOICE_ENABLED === "true", revision: (process.env.APP_REVISION || process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 12) });
}
