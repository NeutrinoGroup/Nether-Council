import { NextResponse } from "next/server";
import { syncUserToDatabase } from "@/lib/userDb";
import { DEFAULT_GOOGLE_CLIENT_ID, type GoogleProfile } from "@/lib/googleAuth";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { code, id_token, redirect_uri } = body;

    if (!code && !id_token) {
      return NextResponse.json(
        { error: "Missing authorization code or id_token" },
        { status: 400 }
      );
    }

    // 1. Sandbox / Demo instant verification support
    if (id_token === "demo_verified_google_identity") {
      const demoId = "did:nether:google:demo_spirit_alexander";
      const dbUser = await syncUserToDatabase({
        id: demoId,
        email: "alexander.spirit@nether.council",
        name: "Alexander (孟婆座下客)",
        picture: "https://lh3.googleusercontent.com/a/default-user=s96-c",
        bio: "万圣夜迷路人，在黄泉议会认领了南瓜忘忧汤。",
      });

      const profile: GoogleProfile = {
        id: dbUser.id,
        googleId: "demo_spirit_alexander",
        email: dbUser.email,
        emailVerified: true,
        name: dbUser.name,
        picture: dbUser.picture,
        bio: dbUser.bio,
        referralCode: dbUser.referral_code || "nc_spirit_8888",
        synthetic: true,
      };

      return NextResponse.json({ success: true, profile });
    }

    const clientId =
      process.env.GOOGLE_CLIENT_ID ||
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      DEFAULT_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

    if (!clientSecret) {
      // In development or when GOOGLE_CLIENT_SECRET is missing, provide a friendly explanation or fallback
      return NextResponse.json(
        {
          error: "GOOGLE_CLIENT_SECRET is not configured on this server. For local testing, please use demo login.",
          needsConfig: true,
        },
        { status: 400 }
      );
    }

    // 2. Live Google OAuth 2.0 token exchange
    const tokenUrl = "https://oauth2.googleapis.com/token";
    const redirectUrl = redirect_uri || "http://localhost:3100";

    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUrl,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      return NextResponse.json(
        {
          error:
            tokenData.error_description ||
            tokenData.error ||
            "Failed to exchange Google OAuth code",
        },
        { status: 400 }
      );
    }

    // 3. Fetch Google user profile
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userInfoRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch Google user profile" },
        { status: 400 }
      );
    }

    const googleUser = await userInfoRes.json();
    const userId = `did:nether:google:${googleUser.sub}`;

    const dbUser = await syncUserToDatabase({
      id: userId,
      email: googleUser.email,
      name: googleUser.name || googleUser.email.split("@")[0],
      picture: googleUser.picture || null,
      bio: "Nether Council Halloween Visitor",
    });

    const profile: GoogleProfile = {
      id: dbUser.id,
      googleId: googleUser.sub,
      email: dbUser.email,
      emailVerified: Boolean(googleUser.email_verified),
      name: dbUser.name,
      picture: dbUser.picture,
      bio: dbUser.bio,
      referralCode: dbUser.referral_code || "nc_guest",
      synthetic: false,
    };

    return NextResponse.json({ success: true, profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
