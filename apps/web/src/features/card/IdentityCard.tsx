"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IdentityResult, Locale } from "@nether/contracts";
import { normalizeNickname } from "@nether/party-core";
import { exportCardPngBlob, renderCardToCanvas, type CardRenderOptions } from "./canvas";
import { cardShareHeaders } from "./share-access";

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
}: IdentityCardProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [nickname, setNickname] = useState<string>(initialNickname);
  const [hideVerdict, setHideVerdict] = useState<boolean>(false);
  const [invitation, setInvitation] = useState<{ key: string; url: string }>();
  const [shareFailure, setShareFailure] = useState<string>();
  const [shareRetry, setShareRetry] = useState(0);
  const [rendering, setRendering] = useState<boolean>(true);
  const [renderError, setRenderError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [prepared, setPrepared] = useState<{ options: CardRenderOptions; blob: Blob }>();
  const [copiedKind, setCopiedKind] = useState<"text" | "link" | null>(null);

  const identityKey = `${result.sessionId}:${result.characterId}:${result.id}`;
  const shareUrl = useMemo(() => {
    if (invitation?.key !== identityKey) return "";
    const url = new URL(invitation.url);
    url.searchParams.set("lang", locale);
    return url.href;
  }, [invitation, identityKey, locale]);
  const shareError = shareFailure === identityKey;
  const options = useMemo(() => ({ result, nickname, hideVerdict, locale, shareUrl }), [result, nickname, hideVerdict, locale, shareUrl]);
  const canDownload = prepared?.options === options && !renderError;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderedOnce = useRef<string>(undefined);

  // Obtain signed referral URL
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/referrals", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...cardShareHeaders(result.sessionId) },
          body: JSON.stringify({ sessionId: result.sessionId }),
          signal: abort.signal,
        });
        if (!response.ok) throw new Error("SHARING_UNAVAILABLE");
        const data = await response.json();
        if (typeof data.shareUrl !== "string") throw new Error("INVALID_INVITATION");
        const url = new URL(data.shareUrl);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("INVALID_INVITATION");
        if (active) { setInvitation({ key: identityKey, url: url.href }); setShareFailure(undefined); }
      } catch { if (active) setShareFailure(identityKey); }
    })();
    return () => {
      active = false;
      abort.abort();
    };
  }, [identityKey, result.sessionId, shareRetry]);

  // Render card to canvas
  useEffect(() => {
    if (!canvasRef.current || !shareUrl) return;
    let active = true;
    setRendering(true);
    setRenderError(false);

    void (async () => {
      try {
        // An obsolete render may finish loading fonts or QR pixels after edits.
        // Only a completed current snapshot can publish pixels to the preview.
        const snapshot = document.createElement("canvas");
        await renderCardToCanvas(snapshot, options);
        if (!active) return;
        const blob = await exportCardPngBlob(snapshot);
        if (active && canvasRef.current) {
          const preview = canvasRef.current;
          const context = preview.getContext("2d");
          if (!context) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
          preview.width = snapshot.width;
          preview.height = snapshot.height;
          context.drawImage(snapshot, 0, 0);
          setPrepared({ options, blob });
          setRendering(false);
        }
      } catch {
        if (active) { setRendering(false); setRenderError(true); }
      }
    })();

    return () => {
      active = false;
    };
  }, [options, result.sessionId, shareUrl, retry]);

  useEffect(() => {
    if (!canDownload || renderedOnce.current === identityKey) return;
    let afterPaint = 0;
    // Wait until React reveals the prepared canvas and the browser has had a
    // frame to display it. Encoding alone is not a completed card preview.
    const frame = requestAnimationFrame(() => {
      afterPaint = requestAnimationFrame(() => {
        const preview = canvasRef.current;
        if (!preview || preview.hidden || renderedOnce.current === identityKey) return;
        renderedOnce.current = identityKey;
        void emitTelemetry("card_rendered", result.sessionId);
        if (!result.fallback) void emitTelemetry("conversation_completed", result.sessionId);
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(afterPaint); };
  }, [canDownload, identityKey, result.sessionId, result.fallback]);

  const handleDownload = () => {
    if (!canDownload || !prepared) return;
    void emitTelemetry("card_download_clicked", result.sessionId);
    try {
      // Encoding is already complete, so the download stays in the click gesture.
      const url = URL.createObjectURL(prepared.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nether-identity-${result.sessionId.slice(0, 8)}.png`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      void emitTelemetry("card_download_created", result.sessionId);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setRenderError(true);
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
          aria-busy={!canDownload}
          hidden={!canDownload}
          style={{ width: "100%", maxWidth: "420px", height: "auto", aspectRatio: "3 / 4", borderRadius: "12px", border: "1px solid var(--line)" }}
        />
        {!shareError && (rendering || !shareUrl) && <div className="card-rendering-indicator">{locale === "zh" ? "正在绘制身份卡…" : "Rendering card…"}</div>}
        {shareError && <div role="alert">
          <p>{locale === "zh" ? "邀请暂时无法生成，请重试。" : "The invitation is unavailable. Please retry."}</p>
          <button onClick={() => { setShareFailure(undefined); setShareRetry(value => value + 1); }}>{locale === "zh" ? "重试生成邀请" : "Retry invitation"}</button>
        </div>}
        {renderError && <div role="alert">
          <p>{locale === "zh" ? "身份卡绘制失败，请重试。" : "The card could not be prepared. Please retry."}</p>
          <button onClick={() => setRetry(value => value + 1)}>{locale === "zh" ? "重新绘制身份卡" : "Render card again"}</button>
        </div>}
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
          <button className="primary-action-btn" disabled={!canDownload} onClick={handleDownload}>
            {locale === "zh" ? "下载身份卡 PNG" : "Download Card PNG"}
          </button>
          <button className="secondary-action-btn" disabled={!shareUrl} onClick={handleCopyText}>
            {copiedKind === "text" ? (locale === "zh" ? "文案已复制 ✓" : "Copied ✓") : (locale === "zh" ? "复制分享文案" : "Copy share text")}
          </button>
          <button className="secondary-action-btn" disabled={!shareUrl} onClick={handleCopyLink}>
            {copiedKind === "link" ? (locale === "zh" ? "链接已复制 ✓" : "Copied ✓") : (locale === "zh" ? "复制邀请链接" : "Copy invite link")}
          </button>
          {canSystemShare && (
            <button className="secondary-action-btn" disabled={!shareUrl} onClick={handleSystemShare}>
              {locale === "zh" ? "分享到…" : "Share via…"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

async function emitTelemetry(name: "card_rendered" | "conversation_completed" | "card_download_clicked" | "card_download_created" | "share_invoked" | "invite_copied", sessionId: string) {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cardShareHeaders(sessionId) },
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
