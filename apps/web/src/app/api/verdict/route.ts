import { z } from "zod";
import { ConfirmedTurn } from "@nether/contracts";
import { serverConfig } from "@/shared/server/config";
import { cookieToken, readSession, sameOrigin } from "@/shared/server/tickets";
import { generateIdentity } from "@/features/verdict/server/generator";

export const runtime = "nodejs";

const Input = z.strictObject({
  sessionId: z.uuid(),
  turns: z.array(ConfirmedTurn).min(1).max(16),
});

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 65_536) return new Response(null, { status: 413 });

  const config = serverConfig();
  const claims = readSession(cookieToken(request), config.sessionSecret);
  if (!claims) return Response.json({ error: "SESSION_EXPIRED" }, { status: 401 });

  let input: z.infer<typeof Input>;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 65_536) return new Response(null, { status: 413 });
    input = Input.parse(JSON.parse(raw));
  } catch {
    return Response.json({ error: "INVALID_MESSAGE" }, { status: 400 });
  }

  if (input.sessionId !== claims.session.id) return Response.json({ error: "SESSION_MISMATCH" }, { status: 403 });

  try {
    const result = await generateIdentity(claims.session, input.turns, config.text, request.signal);
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_STORY") {
      return Response.json({ error: "NO_STORY" }, { status: 400 });
    }
    return Response.json({ error: "RESULT_FAILED" }, { status: 502 });
  }
}
