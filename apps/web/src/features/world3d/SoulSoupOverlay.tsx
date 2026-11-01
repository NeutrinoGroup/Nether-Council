"use client";
import type { CSSProperties } from "react";
import type { Locale } from "@nether/contracts";
import type { SoulSoupView } from "../voice/client";

export function SoulSoupOverlay({ soup, locale }: { soup?: SoulSoupView; locale: Locale }) {
  return <div className="soul-soup" data-mood={soup?.mood ?? "healing"} data-ritual={Boolean(soup?.ritual)}>
    <p className="soup-flavour">{locale === "zh" ? "今夜限定 · 南瓜肉桂拿铁味孟婆汤" : "Tonight only · Pumpkin cinnamon latte soul soup"}</p>
    <div className="soul-worries" key={soup?.ritual?.callId ?? "listening"} aria-label={locale === "zh" ? "倒进汤里的烦恼" : "Worries for the soup"}>
      {soup?.worries.map((word, index) => <span key={word} className="soul-worry" style={{ "--ghost-index": index } as CSSProperties}>{word}</span>)}
    </div>
    <div className="soup-blessing" role="status" aria-live="polite" aria-atomic="true">
      {soup?.ritual && <div key={soup.ritual.callId} className="soup-fortune">
        <span>{locale === "zh" ? "汤已饮，烦恼化灰 · 万圣解忧签" : "Soup sipped, worries to ash · Halloween blessing"}</span>
        <p>{soup.ritual.blessing}</p>
      </div>}
    </div>
  </div>;
}
