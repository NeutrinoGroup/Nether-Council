"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import type { Locale } from "@nether/contracts";
import type { GoogleProfile } from "@/lib/googleAuth";
import { readEntryQuery } from "./entry-context";

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
  const [copyFailed, setCopyFailed] = useState(false);
  const [invitation, setInvitation] = useState<{
    status: "loading" | "invalid" | "failed" | "ready";
    shareUrl?: string;
    qrDataUrl?: string;
    usableUntil?: number;
  }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { shareUrl = "", qrDataUrl = "" } = invitation;
  const ready = invitation.status === "ready";

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const generate = async () => {
      try {
        const query = readEntryQuery(window.location.search);
        const response = await fetch("/api/referrals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invite: query.invite, locale, characterId: query.character }),
          signal: controller.signal,
        });
        if (!active) return;
        if (response.status === 401 || response.status === 403) {
          setInvitation({ status: "invalid" });
          return;
        }
        if (!response.ok) throw new Error("Invitation unavailable");
        const data = await response.json();
        if (typeof data.shareUrl !== "string" || !/^https?:$/.test(new URL(data.shareUrl).protocol)) throw new Error("Invalid invitation URL");
        if (data.expiresAt !== undefined && (typeof data.expiresAt !== "number" || !Number.isFinite(data.expiresAt))) throw new Error("Invalid invitation expiry");
        const usableUntil = data.expiresAt === undefined ? undefined : data.expiresAt - 235_000;
        const qr = await QRCode.toDataURL(data.shareUrl, {
          errorCorrectionLevel: "M", margin: 4, width: 512,
          color: { dark: "#11100f", light: "#fff2df" },
        });
        if (!active) return;
        if (usableUntil !== undefined && usableUntil <= Date.now()) {
          setInvitation({ status: "invalid" });
          return;
        }
        setInvitation({ status: "ready", shareUrl: data.shareUrl, qrDataUrl: qr, usableUntil });
        if (usableUntil !== undefined) {
          const expire = () => {
            if (!active) return;
            const remaining = usableUntil - Date.now();
            if (remaining <= 0) { setInvitation({ status: "invalid" }); setCopied(false); }
            else expiryTimer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
          };
          expire();
        }
      } catch {
        if (active) setInvitation({ status: "failed" });
      }
    };
    void generate();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(expiryTimer);
    };
  }, [locale, attempt]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const isUsable = () => {
    if (!ready) return false;
    if (invitation.usableUntil !== undefined && invitation.usableUntil <= Date.now()) {
      setInvitation({ status: "invalid" });
      setCopied(false);
      return false;
    }
    return true;
  };

  const handleCopy = async () => {
    if (!isUsable()) return;
    setCopied(false);
    setCopyFailed(false);
    let success = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        success = true;
      } else {
        throw new Error("clipboard unavailable");
      }
    } catch {
      const textarea = document.createElement("textarea");
      try {
        textarea.value = shareUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        success = document.execCommand("copy");
      } catch { /* Report failure if both clipboard mechanisms are unavailable. */ }
      finally { textarea.remove(); }
    }
    setCopied(success);
    setCopyFailed(!success);
    if (success) setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadQr = () => {
    if (!isUsable() || !qrDataUrl) return;
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
        backgroundColor: "rgba(17, 16, 15, 0.82)",
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
          background: "linear-gradient(180deg, #1b1612 0%, #12100e 100%)",
          border: "1px solid #5b5144",
          borderTop: "2px solid #f6a15d",
          borderRadius: 0,
          padding: "28px 24px",
          color: "#eee7d9",
          boxShadow: "0 24px 64px rgba(17, 10, 5, 0.65)",
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
            borderRadius: 0,
            color: "#bcb0a0",
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
              style={{ width: 44, height: 44, borderRadius: 0, border: "1px solid #f6a15d" }}
            />
          ) : (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 0,
                border: "1px solid #f6a15d",
                background: "#171410",
                color: "#eee7d9",
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
            <h3 style={{ margin: 0, fontSize: 17, color: "#eee7d9" }}>{user.name}</h3>
            <span style={{ fontSize: 12, color: "#bcb0a0" }}>
              {ready ? (isZh ? "活动邀请已就绪" : "Event invitation ready") : (isZh ? "活动邀请" : "Event invitation")}
            </span>
          </div>
        </div>

        <div style={{ marginTop: 2 }}>
          <h4 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 400, lineHeight: 1.25, fontFamily: isZh ? '"Ma Shan Zheng", cursive' : '"Bodoni Moda", Georgia, serif', color: "#eee7d9", textWrap: "balance" }}>
            {isZh ? "万圣专属通行证 · 邀好友入席" : "Halloween Council Pass · Invite Friends"}
          </h4>
          <p style={{ margin: 0, fontSize: 13, color: "#bcb0a0", lineHeight: 1.5 }}>
            {isZh
              ? "扫码或通过专属链接进入，与孟婆及黄泉众神夜话倾诉。"
              : "Scan the QR or open your exclusive link to begin the twilight encounter."}
          </p>
        </div>

        <div
          style={{
            background: "#fff2df",
            padding: 12,
            borderRadius: 0,
            border: "1px solid #5b5144",
            boxShadow: "0 12px 28px rgba(17, 10, 5, 0.5)",
            display: "inline-flex",
          }}
        >
          {ready && qrDataUrl ? (
            <Image
              src={qrDataUrl}
              alt="Halloween Share QR Code"
              width={512}
              height={512}
              unoptimized
              style={{ width: "min(280px, 64vw)", height: "auto", display: "block" }}
            />
          ) : (
            <div role="status" style={{ width: "min(280px, 64vw)", height: 190, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", color: "#5b5144" }}>
              <span>{invitation.status === "invalid"
                ? (isZh ? "请先打开有效的活动邀请" : "Please open a valid event invitation first.")
                : invitation.status === "failed"
                  ? (isZh ? "邀请暂时无法生成，请重试。" : "Your invitation could not be generated. Please try again.")
                  : (isZh ? "生成二维码中…" : "Generating QR…")}</span>
              {invitation.status === "failed" && <button onClick={() => {
                setInvitation({ status: "loading" }); setCopyFailed(false); setCopied(false); setAttempt(value => value + 1);
              }} style={{ background: "#171410", color: "#eee7d9", border: "1px solid #39342d", borderRadius: 0 }}>{isZh ? "重新生成邀请" : "Retry invitation"}</button>}
            </div>
          )}
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#171410",
              border: "1px solid #39342d",
              borderRadius: 0,
              padding: "4px 8px",
              gap: 8,
            }}
          >
            <input
              type="text"
              readOnly
              aria-label={isZh ? "邀请链接" : "Invitation link"}
              value={shareUrl}
              style={{
                background: "transparent",
                border: 0,
                borderRadius: 0,
                color: "#bcb0a0",
                fontSize: 12,
                flex: 1,
                minWidth: 0,
                outlineColor: "#f6a15d",
                textOverflow: "ellipsis",
              }}
            />
            <button
              onClick={handleCopy}
              disabled={!ready}
              style={{
                background: copied ? "#3b2618" : "#f6a15d",
                color: copied ? "#eee7d9" : "#11100f",
                border: "1px solid #39342d",
                borderRadius: 0,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: ready ? "pointer" : "not-allowed",
                opacity: ready ? 1 : 0.5,
                transition: "background 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? (isZh ? "已复制！" : "Copied!") : (isZh ? "复制链接" : "Copy Link")}
            </button>
          </div>

          {copyFailed && <p role="alert" style={{ margin: 0, color: "#f6a15d", fontSize: 12 }}>
            {isZh ? "复制失败，请手动复制邀请链接。" : "Copy failed. Please copy the invitation link manually."}
          </p>}

          <button
            onClick={handleDownloadQr}
            disabled={!ready}
            style={{
              background: "#171410",
              color: "#eee7d9",
              border: "1px solid #39342d",
              borderRadius: 0,
              padding: "9px 16px",
              fontSize: 13,
              cursor: ready ? "pointer" : "not-allowed",
              opacity: ready ? 1 : 0.5,
            }}
          >
            {isZh ? "下载二维码图片 (PNG)" : "Download QR Image (PNG)"}
          </button>
        </div>
      </div>
    </div>
  );
}
