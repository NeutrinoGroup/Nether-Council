import { NextResponse } from "next/server";
import { getUserById } from "@/lib/userDb";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 404 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      bio: user.bio,
      referralCode: user.referral_code,
    },
  });
}
