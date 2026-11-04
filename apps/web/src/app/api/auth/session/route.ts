import { NextResponse } from "next/server";
import { getUserById } from "@/lib/userDb";
import { AUTH_COOKIE, readIdentity, writeCookie } from "@/lib/authSession";
import { sameOrigin } from "@/shared/server/tickets";
export async function GET(request: Request) {
  try {
    const identity = readIdentity(request);
    if (!identity) return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
    const user = await getUserById(identity.userId);
    if (!user) return NextResponse.json({ authenticated: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ authenticated: true, profile: { id: user.id, googleId: user.id.replace("did:nether:google:", ""), email: user.email, name: user.name, picture: user.picture, bio: user.bio, referralCode: user.referral_code, emailVerified: !identity.synthetic, synthetic: identity.synthetic } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Identity service unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
export function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const response = NextResponse.json({ success: true });
  writeCookie(response, AUTH_COOKIE, "", 0, request);
  return response;
}
