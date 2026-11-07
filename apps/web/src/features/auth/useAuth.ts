"use client";

import { useSyncExternalStore, useCallback, useEffect } from "react";
import {
  AUTH_CHANGE_EVENT,
  getAuthRevision,
  clearGoogleProfile,
  getGoogleAuthUrl,
  getStoredGoogleProfile,
  loginWithDemoAccount,
  recordGoogleProfile,
  type GoogleProfile,
} from "@/lib/googleAuth";
import { rememberEntryContext } from "./entry-context";

function subscribeAuth(notify: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AUTH_CHANGE_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

function getSnapshot(): GoogleProfile | null {
  return getStoredGoogleProfile();
}

function getServerSnapshot(): GoogleProfile | null {
  return null;
}

export function useAuth() {
  const user = useSyncExternalStore(subscribeAuth, getSnapshot, getServerSnapshot);

  useEffect(() => {
    let active = true;
    const revision = getAuthRevision();
    fetch("/api/auth/session", { cache: "no-store" }).then(r => r.json()).then(data => {
      if (!active || revision !== getAuthRevision()) return;
      if (data.authenticated && data.profile) recordGoogleProfile(data.profile);
      else clearGoogleProfile();
    }).catch(() => { if (active && revision === getAuthRevision()) clearGoogleProfile(); });
    return () => { active = false; };
  }, []);

  const loginWithGoogle = useCallback(() => {
    if (typeof window !== "undefined") {
      rememberEntryContext();
      window.location.href = getGoogleAuthUrl();
    }
  }, []);

  const loginDemo = useCallback(async () => {
    const profile = await loginWithDemoAccount();
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      if (response.ok) clearGoogleProfile();
    } catch { /* Retain the session display if server logout could not complete. */ }
  }, []);

  return { user, loading: false, loginWithGoogle, loginDemo, logout };
}
