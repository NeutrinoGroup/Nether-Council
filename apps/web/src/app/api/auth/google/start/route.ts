import { NextResponse } from "next/server";
import { createGoogleFlow, FLOW_COOKIE, writeCookie } from "@/lib/authSession";
export function GET(request: Request) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) throw new Error("AUTH_NOT_CONFIGURED");
    const origin = new URL(request.url).origin;
    const flow = createGoogleFlow(origin);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: origin, response_type: "code", scope: "openid email profile", state: flow.state, code_challenge: flow.challenge, code_challenge_method: "S256", prompt: "select_account" }).toString();
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    writeCookie(response, FLOW_COOKIE, flow.token, 600, request);
    return response;
  } catch { return NextResponse.json({ error: "Google login is not configured" }, { status: 503 }); }
}
