"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CHARACTER_IDS, getCharacter } from "@nether/party-core";
import type { CharacterId, Locale } from "@nether/contracts";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const artwork = (id: CharacterId) => `/artworks/${id}.webp`;
const railIds = [...CHARACTER_IDS, ...CHARACTER_IDS];

function Arrow({ back = false }: { back?: boolean }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={back ? { transform: "rotate(180deg)" } : undefined}><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

export function CastCarousel({ locale, href, onChoose }: { locale: Locale; href: (id: CharacterId) => string; onChoose: (id: CharacterId) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const reel = useRef<HTMLDivElement>(null);
  const posters = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const zh = locale === "zh";

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      // Native scroll containers stay available for touch, keyboard and the buttons.
      // ScrollTrigger only advances them when the page's vertical position changes.
      for (const [element, reverse] of [[posters.current, false], [reel.current, false], [details.current, true]] as const) {
        if (!element) continue;
        const distance = () => Math.max(0, element.scrollWidth - element.clientWidth);
        gsap.fromTo(element, { scrollLeft: reverse ? distance : 0 }, {
          scrollLeft: reverse ? 0 : distance,
          ease: "none",
          scrollTrigger: {
            trigger: element,
            start: "clamp(top bottom)",
            end: "clamp(bottom top)",
            scrub: 0.65,
            invalidateOnRefresh: true,
          },
        });
      }
    });
    return () => media.revert();
  }, { scope: root });

  function move(direction: number) {
    const element = reel.current;
    if (!element) return;
    const distance = element.scrollWidth - element.clientWidth;
    const first = element.children[0] as HTMLElement;
    const second = element.children[1] as HTMLElement;
    const atEnd = element.scrollLeft >= distance - 2;
    const atStart = element.scrollLeft <= 2;
    const left = direction > 0 && atEnd ? 0 : direction < 0 && atStart ? distance : element.scrollLeft + direction * (second.offsetLeft - first.offsetLeft);
    element.scrollTo({ left, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  return <div ref={root} className="cast-carousel">
    <div className="cast-ribbon cast-poster-ribbon" aria-hidden="true">
      <div ref={posters} className="cast-ribbon-reel">
        {railIds.map((id, index) => <div className="cast-poster-print" key={`${id}-${index}`}><Image src={getCharacter(id).posterUrl} width={500} height={500} alt="" unoptimized loading="lazy" /></div>)}
      </div>
    </div>
    <div className="cast-gallery-tools">
      <p>{zh ? "七位来客，各有故事。选一位，开聊。" : "Seven guests. Seven stories. Choose your company."}</p>
      <div className="cast-gallery-controls">
        <span className="cast-position" aria-hidden="true">{String(current + 1).padStart(2, "0")} / 07</span>
        <button type="button" onClick={() => move(-1)} aria-label={zh ? "上一位角色" : "Previous character"}><Arrow back /></button>
        <button type="button" onClick={() => move(1)} aria-label={zh ? "下一位角色" : "Next character"}><Arrow /></button>
      </div>
    </div>
    <div ref={reel} className="cast-reel" tabIndex={0} role="region" aria-label={zh ? "角色原画，左右滑动选择角色" : "Character artwork, scroll sideways to choose"} onScroll={() => {
      const element = reel.current;
      if (!element) return;
      const first = element.children[0] as HTMLElement;
      let nearest = 0;
      for (let index = 1; index < element.children.length; index++) {
        const card = element.children[index] as HTMLElement;
        if (Math.abs(card.offsetLeft - first.offsetLeft - element.scrollLeft) < Math.abs((element.children[nearest] as HTMLElement).offsetLeft - first.offsetLeft - element.scrollLeft)) nearest = index;
      }
      setCurrent(nearest);
    }}>
      {CHARACTER_IDS.map(id => {
        const character = getCharacter(id);
        return <Link key={id} href={href(id)} className="cast-performer" aria-label={`${zh ? "与这位角色开聊" : "Talk to this character"}: ${character.name[locale]}`} onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onChoose(id);
        }}>
          <div className="cast-effigy"><Image src={artwork(id)} width={960} height={1200} alt="" unoptimized loading="lazy" /></div>
          <span className="cast-name">{character.name[locale]}<Arrow /></span>
          <span className="cast-character-role">{character.role[locale]}</span>
          <span className="cast-medium">{zh ? "角色原画 · 实时语音" : "Original artwork · Live voice"}</span>
        </Link>;
      })}
    </div>
    <div className="cast-ribbon cast-detail-ribbon" aria-hidden="true">
      <div ref={details} className="cast-ribbon-reel">
        {railIds.map((id, index) => <div className="cast-detail-print" key={`${id}-${index}`}><Image src={artwork(id)} width={960} height={1200} alt="" unoptimized loading="lazy" /><span>{getCharacter(id).name[locale]}</span></div>)}
      </div>
    </div>
  </div>;
}
