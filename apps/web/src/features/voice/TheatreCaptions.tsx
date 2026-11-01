"use client";
import { AnimatePresence, motion } from "framer-motion";
import type { DisplayCaption } from "@nether/party-core";
import type { Locale } from "@nether/contracts";

export function TheatreCaptions({ caption, userCaption, locale, reduced }: { caption?: DisplayCaption; userCaption?: DisplayCaption; locale: Locale; reduced: boolean }) {
  return <div className="theatre-subtitles" aria-label={locale === "zh" ? "剧场字幕" : "Theatre subtitles"}>
    <AnimatePresence mode="popLayout">
      {[{ item: userCaption, speaker: "user" }, { item: caption, speaker: "character" }].map(({ item, speaker }) => item && <motion.div
        className={`theatre-subtitle ${speaker}`} key={`${speaker}-${item.segmentId}`}
        initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 18 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -28, filter: reduced ? "none" : "blur(8px)" }} transition={{ duration: reduced ? 0 : 0.8 }}>
        <p className="sr-only" aria-live={item.final ? "polite" : "off"}>{item.sourceText}</p>
        <motion.p aria-hidden="true" initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: reduced ? 0 : 0.016 } } }}>
          {Array.from(item.sourceText).map((letter, index) => <motion.span key={index} variants={{ hidden: { opacity: 0, filter: reduced ? "none" : "blur(5px)" }, visible: { opacity: 1, filter: "blur(0px)", transition: { duration: reduced ? 0 : 0.35 } } }}>{letter}</motion.span>)}
        </motion.p>
        {item.final && <p className="subtitle-translation" lang={item.sourceLocale === "zh" ? "en" : "zh"}>{item.translationStatus === "ready" ? item.translatedText : item.translationStatus === "unavailable" ? (locale === "zh" ? "译文暂不可用" : "Translation unavailable") : (locale === "zh" ? "正在翻译…" : "Translating…")}</p>}
      </motion.div>)}
    </AnimatePresence>
  </div>;
}
