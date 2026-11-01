"use client";

import { useState } from "react";
import Image from "next/image";
import type { Locale } from "@nether/contracts";
import { useAuth } from "./useAuth";
import { ShareQrModal } from "./ShareQrModal";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

function QrIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7"></rect>
      <rect x="14" y="3" width="7" height="7"></rect>
      <rect x="14" y="14" width="7" height="7"></rect>
      <rect x="3" y="14" width="7" height="7"></rect>
    </svg>
  );
}

export function UserNavBadge({ locale = "zh" }: { locale?: Locale }) {
  const { user, loading, loginWithGoogle, loginDemo, logout } = useAuth();
  const [shareOpen, setShareOpen] = useState(false);
  const isZh = locale === "zh";

  if (loading) {
    return <div style={{ fontSize: 12, color: "var(--ash, #8a948c)" }}>...</div>;
  }

  if (!user) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={loginWithGoogle}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "#1c211e",
            color: "#eee7d9",
            border: "1px solid #3d463f",
            borderRadius: 20,
            padding: "6px 14px",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 500,
            transition: "all 0.2s",
          }}
          title={isZh ? "使用 Google 账号登录并获取专属推荐码" : "Sign in with Google"}
        >
          <GoogleIcon />
          <span>{isZh ? "Google 登录" : "Sign in"}</span>
        </button>
        <button
          onClick={() => void loginDemo()}
          style={{
            background: "none",
            border: "1px dashed #3d463f",
            borderRadius: 14,
            color: "#8a948c",
            padding: "4px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
          title={isZh ? "无需 Google Key，一键测试登录" : "Demo sandbox sign in"}
        >
          {isZh ? "体验登录" : "Demo"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {user.picture ? (
            <Image
              src={user.picture}
              alt={user.name}
              width={28}
              height={28}
              unoptimized
              style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #ff7a29" }}
            />
          ) : (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "#ff7a29",
                color: "#161917",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: "bold",
              }}
            >
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: 13, color: "#eee7d9", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.name}
          </span>
        </div>

        <button
          onClick={() => setShareOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#e0813c",
            color: "#fff",
            border: 0,
            borderRadius: 16,
            padding: "5px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(224, 129, 60, 0.3)",
          }}
          title={isZh ? "分享专属链接或二维码" : "Share link or QR code"}
        >
          <QrIcon />
          <span>{isZh ? "分享 / 二维码" : "Share & QR"}</span>
        </button>

        <button
          onClick={logout}
          style={{
            background: "none",
            border: 0,
            color: "#8a948c",
            fontSize: 12,
            cursor: "pointer",
            padding: "4px 6px",
          }}
          title={isZh ? "退出登录" : "Sign out"}
        >
          {isZh ? "退出" : "Out"}
        </button>
      </div>

      {shareOpen && (
        <ShareQrModal user={user} locale={locale} onClose={() => setShareOpen(false)} />
      )}
    </>
  );
}
