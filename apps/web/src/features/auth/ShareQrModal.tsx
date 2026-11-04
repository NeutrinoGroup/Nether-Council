"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import type { Locale } from "@nether/contracts";
import type { GoogleProfile } from "@/lib/googleAuth";

export function ShareQrModal({
  user,
  locale = "zh",
  onClose,
}: {
  user: GoogleProfile;
  locale?: Locale;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const origin = typeof window !== "undefined" ? window.location.origin : "https://nether-council.vercel.app";
  const shareUrl = `${origin}/?ref=${encodeURIComponent(user.referralCode)}&invite=halloween`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(shareUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 220,
      color: { dark: "#120e17", light: "#fff2df" },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {});

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      active = false;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shareUrl, onClose]);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        throw new Error("clipboard unavailable");
      }
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `nether-council-pass-${user.referralCode}.png`;
    a.click();
  };

  const isZh = locale === "zh";

  return (
    <div
      className="share-qr-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        backgroundColor: "rgba(7, 8, 9, 0.78)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        className="share-qr-card"
        style={{
          width: "min(440px, 92vw)",
          background: "#161917",
          border: "1px solid #3d463f",
          borderRadius: 16,
          padding: "28px 24px",
          color: "#eee7d9",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.6)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          textAlign: "center",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label={isZh ? "关闭" : "Close"}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: 0,
            color: "#8a948c",
            fontSize: 18,
            cursor: "pointer",
            padding: 8,
          }}
        >
          ✕
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
          {user.picture ? (
            <Image
              src={user.picture}
              alt={user.name}
              width={44}
              height={44}
              unoptimized
              style={{ width: 44, height: 44, borderRadius: "50%", border: "1px solid #ff7a29" }}
            />
          ) : (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "#ff7a29",
                color: "#161917",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                fontSize: 18,
              }}
            >
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ textAlign: "left" }}>
            <h3 style={{ margin: 0, fontSize: 17, color: "#fff" }}>{user.name}</h3>
            <span style={{ fontSize: 12, color: "#9ca99f" }}>
              {isZh ? "专属异界通行码: " : "Referral Code: "}
              <code style={{ color: "#ff8b3d" }}>{user.referralCode}</code>
            </span>
          </div>
        </div>

        <div style={{ marginTop: 2 }}>
          <h4 style={{ margin: "0 0 6px", fontSize: 19, fontFamily: isZh ? "Ma Shan Zheng, serif" : "inherit", color: "#f3ede2" }}>
            {isZh ? "万圣专属通行证 · 邀好友入席" : "Halloween Council Pass · Invite Friends"}
          </h4>
          <p style={{ margin: 0, fontSize: 13, color: "#8a948c", lineHeight: 1.5 }}>
            {isZh
              ? "扫码或通过专属链接进入，与孟婆及黄泉众神夜话倾诉。"
              : "Scan the QR or open your exclusive link to begin the twilight encounter."}
          </p>
        </div>

        <div
          style={{
            background: "#fff2df",
            padding: 12,
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
            display: "inline-flex",
          }}
        >
          {qrDataUrl ? (
            <Image
              src={qrDataUrl}
              alt="Halloween Share QR Code"
              width={190}
              height={190}
              unoptimized
              style={{ width: 190, height: 190, display: "block" }}
            />
          ) : (
            <div style={{ width: 190, height: 190, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
              {isZh ? "生成二维码中…" : "Generating QR…"}
            </div>
          )}
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#0d0f0e",
              border: "1px solid #282f2a",
              borderRadius: 8,
              padding: "4px 8px",
              gap: 8,
            }}
          >
            <input
              type="text"
              readOnly
              value={shareUrl}
              style={{
                background: "transparent",
                border: 0,
                color: "#abb7af",
                fontSize: 12,
                flex: 1,
                outline: "none",
                textOverflow: "ellipsis",
              }}
            />
            <button
              onClick={handleCopy}
              style={{
                background: copied ? "#285235" : "#e0813c",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? (isZh ? "已复制！" : "Copied!") : (isZh ? "复制链接" : "Copy Link")}
            </button>
          </div>

          <button
            onClick={handleDownloadQr}
            style={{
              background: "transparent",
              color: "#9ca99f",
              border: "1px solid #333c36",
              borderRadius: 8,
              padding: "9px 16px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {isZh ? "下载二维码图片 (PNG)" : "Download QR Image (PNG)"}
          </button>
        </div>
      </div>
    </div>
  );
}
