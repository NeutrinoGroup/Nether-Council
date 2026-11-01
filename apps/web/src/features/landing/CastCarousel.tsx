"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CHARACTER_IDS, getCharacter } from "@nether/party-core";
import type { CharacterId, Locale } from "@nether/contracts";

gsap.registerPlugin(useGSAP, ScrollTrigger);
export function CastCarousel({ locale, href, onChoose }: { locale: Locale; href: (id: CharacterId) => string; onChoose: (id: CharacterId) => void }) {
  const root = useRef<HTMLDivElement>(null), reel = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
      gsap.to(reel.current, { scrollLeft: () => Math.max(0, (reel.current?.scrollWidth ?? 0) - (reel.current?.clientWidth ?? 0)), ease: "none", scrollTrigger: { trigger: root.current, start: "top 70%", end: "bottom 20%", scrub: 0.8, invalidateOnRefresh: true } });
    });
    return () => media.revert();
  }, { scope: root });
  return <div ref={root} className="cast-carousel">
    <div ref={reel} className="cast-reel" tabIndex={0} role="region" aria-label={locale === "zh" ? "今晚的神仙轮盘，可左右滚动" : "Tonight’s cast, scroll sideways"}>
      {CHARACTER_IDS.map(id => {
        const character = getCharacter(id);
        return <Link key={id} href={href(id)} className="cast-performer" aria-label={`${locale === "zh" ? "与这位角色开聊" : "Talk to this character"}: ${character.name[locale]}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onChoose(id); }}>
          <div className="cast-effigy"><Image src={character.posterUrl} width={500} height={500} alt="" unoptimized loading="lazy" /></div>
          <span className="cast-name">{character.name[locale]}<span aria-hidden="true">↗</span></span>
          <span className="cast-character-role">{character.role[locale]}</span>
          <span className="cast-medium">{id === "meng-po" ? (locale === "zh" ? "3D · 实时语音" : "3D · Live voice") : (locale === "zh" ? "角色海报 · 实时语音" : "Character poster · Live voice")}</span>
        </Link>;
      })}
    </div>
  </div>;
}
