export interface GoogleProfile {
  id: string;
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string | null;
  bio?: string | null;
  referralCode: string;
  synthetic?: boolean;
}

export const GOOGLE_EXCHANGE_ENDPOINT = "/api/auth/google/exchange";
export const AUTH_STORAGE_KEY = "nether_user_profile";
export const AUTH_CHANGE_EVENT = "nether_auth_change";

export const DEFAULT_GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  process.env.GOOGLE_CLIENT_ID ||
  "59186292138-vd5g8l7uceqku34fua7f0sg79lpe2h98.apps.googleusercontent.com";

export function isGoogleOAuthCallback(params: URLSearchParams): boolean {
  const code = params.get("code");
  const scope = params.get("scope");
  return Boolean(code && (!scope || scope.includes("googleapis") || scope.includes("google")));
}

export type GoogleCallbackParse =
  | { kind: "google"; code: string }
  | { kind: "other"; reason: "no-code" | "not-google" };

export function parseGoogleCallback(params: URLSearchParams): GoogleCallbackParse {
  const code = params.get("code");
  if (!code) return { kind: "other", reason: "no-code" };
  if (!isGoogleOAuthCallback(params)) return { kind: "other", reason: "not-google" };
  return { kind: "google", code };
}

export function getGoogleAuthUrl(origin?: string): string {
  const currentOrigin =
    origin || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3100");
  const redirectUri = encodeURIComponent(currentOrigin);
  const scope = encodeURIComponent("openid email profile");
  const state = encodeURIComponent(
    JSON.stringify({
      origin: currentOrigin,
      timestamp: Date.now(),
    })
  );

  return `https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=${DEFAULT_GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri?: string
): Promise<GoogleProfile> {
  const currentOrigin =
    redirectUri || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3100");

  const response = await fetch(GOOGLE_EXCHANGE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: currentOrigin }),
  });

  const data = await response.json();
  if (!response.ok || !data.profile) {
    throw new Error(data.error || "Failed to exchange Google OAuth code");
  }

  return data.profile as GoogleProfile;
}

export async function loginWithDemoAccount(): Promise<GoogleProfile> {
  const response = await fetch(GOOGLE_EXCHANGE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: "demo_verified_google_identity" }),
  });

  const data = await response.json();
  if (!response.ok || !data.profile) {
    throw new Error(data.error || "Failed to verify demo account");
  }

  const profile = data.profile as GoogleProfile;
  recordGoogleProfile(profile);
  return profile;
}

let cachedRaw: string | null = null;
let cachedProfile: GoogleProfile | null = null;

export function recordGoogleProfile(profile: GoogleProfile): void {
  if (typeof window === "undefined") return;
  try {
    cachedProfile = profile;
    cachedRaw = JSON.stringify(profile);
    localStorage.setItem(AUTH_STORAGE_KEY, cachedRaw);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: profile }));
  } catch {}
}

export function getStoredGoogleProfile(): GoogleProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      cachedRaw = null;
      cachedProfile = null;
      return null;
    }
    if (raw === cachedRaw && cachedProfile) {
      return cachedProfile;
    }
    cachedRaw = raw;
    cachedProfile = JSON.parse(raw) as GoogleProfile;
    return cachedProfile;
  } catch {
    cachedRaw = null;
    cachedProfile = null;
    return null;
  }
}

export function clearGoogleProfile(): void {
  cachedRaw = null;
  cachedProfile = null;
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: null }));
  } catch {}
}
