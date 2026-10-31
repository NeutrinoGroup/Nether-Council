"use client";

import { useEffect, useRef, useState } from "react";
import type { IdentityResult, Locale } from "@nether/contracts";
import { normalizeNickname } from "@nether/party-core";
import { exportCardPngBlob, renderCardToCanvas } from "./canvas";

export interface IdentityCardProps {
  result: IdentityResult;
  initialNickname?: string;
  locale: Locale;
  invite?: string;
  onLocaleChange?: (locale: Locale) => void;
}

export function IdentityCard({
  result,
  initialNickname = "",
  locale: initialLocale,
  invite = "",
}: IdentityCardProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [nickname, setNickname] = useState<string>(initialNickname);
  const [hideVerdict, setHideVerdict] = useState<boolean>(false);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [rendering, setRendering] = useState<boolean>(true);
  const [copiedKind, setCopiedKind] = useState<"text" | "link" | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderedOnce = useRef<boolean>(false);

  // Obtain signed referral URL
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/referrals", { method: "POST" });
        if (response.ok) {
          const data = (await response.json()) as { shareUrl: string };
          if (active && data.shareUrl) {
            setShareUrl(data.shareUrl);
            return;
          }
        }
      } catch {}
      // Fallback if referral API unavailable
      if (active) {
        const base = typeof window !== "undefined" ? window.location.origin : "https://ghost.oodai.space";
        const url = new URL("/play", base);
        if (invite) url.searchParams.set("invite", invite);
        url.searchParams.set("character", result.characterId);
        url.searchParams.set("lang", locale);
        setShareUrl(url.href);
      }
    })();
    return () => {
      active = false;
    };
  }, [invite, result.characterId, locale]);

  // Render card to canvas
  useEffect(() => {
    if (!canvasRef.current || !shareUrl) return;
    let active = true;
    setRendering(true);

    void (async () => {
      try {
        await renderCardToCanvas(canvasRef.current!, {
          result,
          nickname,
          hideVerdict,
          locale,
          shareUrl,
        });
        if (active) {
          setRendering(false);
          if (!renderedOnce.current) {
            renderedOnce.current = true;
            void emitTelemetry("card_rendered", result.sessionId);
          }
        }
      } catch (err) {
        console.error("Card rendering error:", err);
      }
    })();

    return () => {
      active = false;
    };
  }, [result, nickname, hideVerdict, locale, shareUrl]);

  const handleDownload = async () => {
    if (!canvasRef.current) return;
    void emitTelemetry("card_download_clicked", result.sessionId);
    try {
      const blob = await exportCardPngBlob(canvasRef.current);
      void emitTelemetry("card_download_created", result.sessionId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nether-identity-${result.sessionId.slice(0, 8)}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error("Failed to export card PNG:", err);
    }
  };

  const getShareText = () => {
    if (locale === "zh") {
      return `孟婆听完我今天的遭遇，给我封了这个身份【${result.title.zh}】。你会被分到什么？ ${shareUrl}`;
    }
    return `Meng Po heard my story and gave me this title: "${result.title.en}". What will you get? ${shareUrl}`;
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(getShareText());
      void emitTelemetry("invite_copied", result.sessionId);
      setCopiedKind("text");
      setTimeout(() => setCopiedKind(null), 2500);
    } catch {}
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      void emitTelemetry("invite_copied", result.sessionId);
      setCopiedKind("link");
      setTimeout(() => setCopiedKind(null), 2500);
    } catch {}
  };

  const handleSystemShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        void emitTelemetry("share_invoked", result.sessionId);
        await navigator.share({
          title: result.title[locale],
          text: getShareText(),
          url: shareUrl,
        });
      } catch {}
    }
  };

  const canSystemShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <section className="identity-card-section" aria-label={locale === "zh" ? "万圣奇遇身份卡" : "Afterlife Identity Card"}>
      <div className="card-preview-container">
        <canvas
          ref={canvasRef}
          className="identity-card-canvas"
          style={{ width: "100%", maxWidth: "420px", height: "auto", aspectRatio: "3 / 4", borderRadius: "12px", border: "1px solid var(--line)" }}
        />
        {rendering && <div className="card-rendering-indicator">{locale === "zh" ? "正在绘制身份卡…" : "Rendering card…"}</div>}
      </div>

      <div className="card-controls">
        <div className="card-toggles">
          <label className="toggle-label">
            <span>{locale === "zh" ? "卡片语言" : "Card language"}</span>
            <div className="language-switch">
              <label>
                <input
                  type="radio"
                  name="card-locale"
                  value="zh"
                  checked={locale === "zh"}
                  onChange={() => setLocale("zh")}
                />
                中文
              </label>
              <label>
                <input
                  type="radio"
                  name="card-locale"
                  value="en"
                  checked={locale === "en"}
                  onChange={() => setLocale("en")}
                />
                English
              </label>
            </div>
          </label>

          <div className="nickname-field">
            <label htmlFor="card-nickname-input">{locale === "zh" ? "卡片称呼" : "Card display name"}</label>
            <input
              id="card-nickname-input"
              value={nickname}
              maxLength={24}
              onChange={e => setNickname(e.target.value)}
              onBlur={() => setNickname(normalizeNickname(nickname))}
              placeholder={locale === "zh" ? "今晚的来宾" : "Tonight's Guest"}
            />
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={hideVerdict}
              onChange={e => setHideVerdict(e.target.checked)}
            />
            {locale === "zh" ? "在分享卡上隐去我的具体经历评价" : "Hide story details on the card"}
          </label>
        </div>

        <div className="card-actions">
          <button className="primary-action-btn" onClick={handleDownload}>
            {locale === "zh" ? "下载身份卡 PNG" : "Download Card PNG"}
          </button>
          <button className="secondary-action-btn" onClick={handleCopyText}>
            {copiedKind === "text" ? (locale === "zh" ? "文案已复制 ✓" : "Copied ✓") : (locale === "zh" ? "复制分享文案" : "Copy share text")}
          </button>
          <button className="secondary-action-btn" onClick={handleCopyLink}>
            {copiedKind === "link" ? (locale === "zh" ? "链接已复制 ✓" : "Copied ✓") : (locale === "zh" ? "复制邀请链接" : "Copy invite link")}
          </button>
          {canSystemShare && (
            <button className="secondary-action-btn" onClick={handleSystemShare}>
              {locale === "zh" ? "分享到…" : "Share via…"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

async function emitTelemetry(name: "card_rendered" | "card_download_clicked" | "card_download_created" | "share_invoked" | "invite_copied", sessionId?: string) {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        sessionId,
        name,
        at: Date.now(),
      }),
      keepalive: true,
    });
  } catch {}
}
