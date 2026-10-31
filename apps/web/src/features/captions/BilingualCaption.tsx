import type { Locale } from "@nether/contracts";
import type { DisplayCaption } from "@nether/party-core";
export function BilingualCaption({ title, caption, locale, fallback, participant = false }: { title: string; caption?: DisplayCaption; locale: Locale; fallback?: string; participant?: boolean }) {
  const target = caption?.sourceLocale === "zh" ? "en" : "zh";
  return <section className={participant ? "user-caption" : "character-caption-group"} aria-label={title}>
    <h2>{title}</h2><p className={participant ? "user-source" : "character-caption"} lang={caption?.sourceLocale ?? locale} aria-live="polite" aria-atomic="true">{caption?.sourceText ?? fallback}</p>
    {caption?.final && <p className="translated-caption" lang={caption.translationStatus === "ready" ? target : locale} aria-live="polite" aria-atomic="true"><span className="caption-language" lang={target}>{target === "en" ? "English" : "中文"}</span>{caption.translationStatus === "ready" ? caption.translatedText : caption.translationStatus === "unavailable" ? (locale === "zh" ? "译文暂不可用，原文仍可阅读。" : "Translation unavailable. The original is still here.") : (locale === "zh" ? "正在翻译…" : "Translating…")}</p>}
  </section>;
}
