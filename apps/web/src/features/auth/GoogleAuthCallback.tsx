"use client";

import { useEffect, useState } from "react";
import {
  exchangeGoogleCode,
  parseGoogleCallback,
  recordGoogleProfile,
} from "@/lib/googleAuth";

let claimedCode: string | null = null;

export function GoogleAuthCallback() {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const parsed = parseGoogleCallback(url.searchParams);
    if (parsed.kind !== "google") return;

    if (claimedCode === parsed.code) return;
    claimedCode = parsed.code;

    url.searchParams.delete("code");
    url.searchParams.delete("scope");
    url.searchParams.delete("authuser");
    url.searchParams.delete("prompt");
    url.searchParams.delete("state");
    window.history.replaceState({}, document.title, url.toString());

    let cancelled = false;
    exchangeGoogleCode(parsed.code)
      .then((profile) => {
        if (cancelled) return;
        recordGoogleProfile(profile);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!errorMsg) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        background: "#3b1318",
        border: "1px solid #ff4e50",
        color: "#ffe5e5",
        padding: "10px 18px",
        borderRadius: 8,
        fontSize: 13,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <span>Google 登录提示: {errorMsg}</span>
      <button
        onClick={() => setErrorMsg(null)}
        style={{ marginLeft: 12, background: "none", border: 0, color: "#fff", cursor: "pointer" }}
      >
        ✕
      </button>
    </div>
  );
}
