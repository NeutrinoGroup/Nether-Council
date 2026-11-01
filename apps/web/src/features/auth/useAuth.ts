"use client";

import { useSyncExternalStore, useCallback } from "react";
import {
  AUTH_CHANGE_EVENT,
  clearGoogleProfile,
  getGoogleAuthUrl,
  getStoredGoogleProfile,
  loginWithDemoAccount,
  type GoogleProfile,
} from "@/lib/googleAuth";

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

  const loginWithGoogle = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.href = getGoogleAuthUrl();
    }
  }, []);

  const loginDemo = useCallback(async () => {
    const profile = await loginWithDemoAccount();
    return profile;
  }, []);

  const logout = useCallback(() => {
    clearGoogleProfile();
  }, []);

  return { user, loading: false, loginWithGoogle, loginDemo, logout };
}
