import { NextResponse } from "next/server";
import { z } from "zod";
import { syncUserToDatabase } from "@/lib/userDb";
import { AUTH_COOKIE, FLOW_COOKIE, demoEnabled, identityToken, readGoogleFlow, writeCookie } from "@/lib/authSession";
import { sameOrigin } from "@/shared/server/tickets";
import type { GoogleProfile } from "@/lib/googleAuth";
const Input = z.object({ code: z.string().min(1).max(4096).optional(), state: z.string().min(1).max(128).optional(), id_token: z.literal("demo_verified_google_identity").optional() });
const GoogleUser = z.object({ sub: z.string().min(1).max(100), email: z.email(), email_verified: z.literal(true), name: z.string().max(128).optional(), picture: z.url().max(512).optional() });
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  let response: NextResponse;
  try {
    const raw = await request.text();
    if (raw.length > 10000) return NextResponse.json({ error: "Invalid message" }, { status: 413 });
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid message" }, { status: 400 }); }
    const parsed = Input.safeParse(value);
    if (!parsed.success || (!parsed.data.code && !parsed.data.id_token)) return NextResponse.json({ error: "Missing authorization code or id_token" }, { status: 400 });
    const body = parsed.data;
    const synthetic = Boolean(body.id_token);
    let googleUser: z.infer<typeof GoogleUser>;
    if (synthetic) {
      if (!demoEnabled()) return NextResponse.json({ error: "Demo login disabled" }, { status: 403 });
      googleUser = { sub: "demo_spirit_alexander", email: "alexander.spirit@nether.council", email_verified: true, name: "Alexander (孟婆座下客)" };
    } else {
      const flow = readGoogleFlow(request);
      if (!flow || body.state !== flow.state || flow.redirectUri !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid or expired login state" }, { status: 400 });
      const clientId = process.env.GOOGLE_CLIENT_ID; const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return NextResponse.json({ error: "Google login is not configured" }, { status: 503 });
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: body.code!, client_id: clientId, client_secret: clientSecret, redirect_uri: flow.redirectUri, code_verifier: flow.verifier, grant_type: "authorization_code" }), signal: AbortSignal.timeout(10000), cache: "no-store" });
      const token = await tokenRes.json();
      if (!tokenRes.ok || typeof token.access_token !== "string") return NextResponse.json({ error: "Google authorization failed" }, { status: 401 });
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10000), cache: "no-store" });
      const user = GoogleUser.safeParse(await userRes.json());
      if (!userRes.ok || !user.success) return NextResponse.json({ error: "Google identity not verified" }, { status: 401 });
      googleUser = user.data;
    }
    const userId = `did:nether:google:${googleUser.sub}`;
    const ticket = identityToken(userId, synthetic);
    const user = await syncUserToDatabase({ id: userId, email: googleUser.email, name: googleUser.name || googleUser.email.split("@")[0], picture: googleUser.picture || null, bio: "Nether Council Visitor" });
    const profile: GoogleProfile = { id: user.id, googleId: googleUser.sub, email: user.email, emailVerified: !synthetic, name: user.name, picture: user.picture, bio: user.bio, referralCode: user.referral_code!, synthetic };
    response = NextResponse.json({ success: true, profile }, { headers: { "Cache-Control": "no-store" } });
    writeCookie(response, AUTH_COOKIE, ticket, 3600, request);
  } catch { response = NextResponse.json({ error: "Identity service unavailable" }, { status: 503 }); }
  writeCookie(response, FLOW_COOKIE, "", 0, request);
  return response;
}
