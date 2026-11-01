import { describe, expect, test, beforeEach } from "vitest";
import { generateQrDataUrl } from "@/features/card/canvas";
import { syncUserToDatabase, getUserById, getUserByReferralCode, clearMemoryUsersForTests } from "@/lib/userDb";
import { POST as googleExchangePost } from "@/app/api/auth/google/exchange/route";
import { GET as sessionGet } from "@/app/api/auth/session/route";

describe("Google Auth, Supabase Users & Share Referral QR", () => {
  beforeEach(() => {
    clearMemoryUsersForTests();
  });

  test("syncUserToDatabase stores user record and generates unique referral code", async () => {
    const user = await syncUserToDatabase({
      id: "did:nether:google:12345678",
      email: "test.ghost@nether.council",
      name: "Pumpkin Spirit",
      picture: "https://example.com/avatar.png",
      bio: "Lost in the Nether",
    });

    expect(user.id).toBe("did:nether:google:12345678");
    expect(user.email).toBe("test.ghost@nether.council");
    expect(user.name).toBe("Pumpkin Spirit");
    expect(user.referral_code).toMatch(/^nc_/);

    const fetchedById = await getUserById("did:nether:google:12345678");
    expect(fetchedById).toEqual(user);

    const fetchedByReferral = await getUserByReferralCode(user.referral_code!);
    expect(fetchedByReferral).toEqual(user);
  });

  test("Google auth exchange endpoint handles demo sandbox identity without requiring live keys", async () => {
    const request = new Request("http://localhost:3100/api/auth/google/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: "demo_verified_google_identity" }),
    });

    const response = await googleExchangePost(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.profile).toBeDefined();
    expect(data.profile.id).toBe("did:nether:google:demo_spirit_alexander");
    expect(data.profile.email).toBe("alexander.spirit@nether.council");
    expect(data.profile.synthetic).toBe(true);
    expect(data.profile.referralCode).toBeDefined();

    // Verify user is retrievable via /api/auth/session
    const sessionReq = new Request(`http://localhost:3100/api/auth/session?userId=${data.profile.id}`);
    const sessionRes = await sessionGet(sessionReq);
    expect(sessionRes.status).toBe(200);
    const sessionData = await sessionRes.json();
    expect(sessionData.authenticated).toBe(true);
    expect(sessionData.user.id).toBe(data.profile.id);
  });

  test("Google auth exchange rejects empty payloads cleanly with 400", async () => {
    const request = new Request("http://localhost:3100/api/auth/google/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await googleExchangePost(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing authorization code or id_token");
  });

  test("User referral link generates valid scan-ready QR code data URL", async () => {
    const referralCode = "nc_spirit_7777";
    const shareUrl = `https://nether-council.vercel.app/?ref=${referralCode}&invite=halloween`;

    const dataUrl = await generateQrDataUrl(shareUrl);

    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(dataUrl.length).toBeGreaterThan(100);
  });
});
