export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ ok: true, protocolVersion: 1, voiceEnabled: process.env.VOICE_ENABLED === "true", revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local" });
}
