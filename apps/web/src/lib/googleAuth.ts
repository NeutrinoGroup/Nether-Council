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
  return new URL("/api/auth/google/start", origin || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3100")).toString();
}

export async function exchangeGoogleCode(
  code: string,
  state: string
): Promise<GoogleProfile> {
  const response = await fetch(GOOGLE_EXCHANGE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
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

let authRevision = 0;
export function getAuthRevision(): number { return authRevision; }
let cachedRaw: string | null = null;
let cachedProfile: GoogleProfile | null = null;

export function recordGoogleProfile(profile: GoogleProfile): void {
  if (typeof window === "undefined") return;
  try {
    authRevision++;
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
  authRevision++;
  cachedRaw = null;
  cachedProfile = null;
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: null }));
  } catch {}
}
