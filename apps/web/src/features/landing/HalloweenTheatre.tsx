"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { CHARACTER_IDS, getCharacter } from "@nether/party-core";
import type { CharacterId, Locale } from "@nether/contracts";
import "./theatre.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);
const Scene = dynamic(() => import("./TheatreScene"), { ssr: false });
const MotionLink = motion.create(Link);

class StageBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const copy = {
  zh: {
    title: ["把烦恼", "留在人间。"], intro: "中式神仙，西式万圣夜。讲一件离谱事，让异界的朋友接住你的梗。", enter: "推门，遇见孟婆", cast: "今晚，谁来接你的梗？", castLink: "认识今晚的神仙", storyTitle: ["最近遇到什么", "离谱事？"], story: "是那场开到半夜的会，还是精心准备却翻车的约会？孟婆为你煮一碗南瓜忘忧汤。你尽管说，她会追问、调侃，也会认真听。", interrupt: "像聊天一样开口。她说话时，你也可以插话。", giftTitle: ["带走一个", "新的自己。"], gift: "几轮聊天后，领取一句只有聊过才会产生的专属评价，和一个值得认领的万圣节身份。保存身份卡，把二维码留给下一个有故事的人。", finale: "今晚的故事，轮到你了。", start: "开始我的奇遇", host: "主持人入口", language: "切换到 English", loading: "孟婆正在入场…", fallback: "3D 暂不可用，仍可进入语音奇遇。", model: "真实 3D · 孟婆", voices: "七位角色均可语音对话，孟婆提供 3D 形象。", footer: "轻吐槽，暖收尾。", privacy: "点击进入后才会申请麦克风；中文 / English，配双语字幕。", name: "黄泉议会", tagline: "神仙也过万圣节", choose: "与这位角色开聊", skip: "跳到体验入口",
  },
  en: {
    title: ["LEAVE IT", "WITH THE SPIRITS."], intro: "Chinese spirits. Halloween company. Bring your most ridiculous story. They'll get the joke.", enter: "Step inside. Meet Meng Po", cast: "Your after-hours company.", castLink: "Meet tonight’s cast", storyTitle: ["What a", "ridiculous day."], story: "The midnight meeting. The date that went spectacularly wrong. Tell Meng Po, the afterlife’s bartender. She’ll stir it into pumpkin soup, ask a little more, and find the funny side with you.", interrupt: "Just talk. You can even interrupt while she’s speaking.", giftTitle: ["A new name.", "Still all you."], gift: "After a few exchanges, take home a personal verdict and a Halloween identity born from your story. Save your identity card. Pass its QR code to a friend with a story of their own.", finale: "Your story takes the stage.", start: "Begin my encounter", host: "Host entrance", language: "切换到中文", loading: "Meng Po is taking the stage…", fallback: "3D is unavailable. Your voice encounter is still ready.", model: "Real 3D · Meng Po", voices: "Seven voice characters. Meng Po also has a 3D character.", footer: "A little roast. A warm ending.", privacy: "Microphone permission comes after entry. 中文 / English, with bilingual subtitles.", name: "NETHER COUNCIL", tagline: "Spirits meet Halloween", choose: "Talk to this character", skip: "Skip to the encounter",
  },
};

function Arrow() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

export function HalloweenTheatre({ initialLocale, query }: { initialLocale: Locale; query: string }) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const progress = useRef({ value: 0 });
  const reduced = useReducedMotion();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [locale, setLocale] = useState(initialLocale);
  const [selected, setSelected] = useState<CharacterId>("meng-po");
  const t = copy[locale];
  const onLoaded = useCallback(() => setLoaded(true), []);
  const onFailure = useCallback(() => { setFailed(true); setLoaded(false); }, []);
  const href = (path: string, character?: CharacterId, lang = locale) => {
    const params = new URLSearchParams(query);
    params.set("lang", lang);
    if (character) params.set("character", character);
    return `${path}?${params}`;
  };

  useEffect(() => {
    const element = stage.current;
    const observer = new IntersectionObserver(([entry]) => setPaused(!entry.isIntersecting), { rootMargin: "80px" });
    if (element) observer.observe(element);
    const visibility = () => setPaused(document.hidden || Boolean(element && element.getBoundingClientRect().bottom < 0));
    document.addEventListener("visibilitychange", visibility);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.to(progress.current, { value: 1, ease: "none", scrollTrigger: { trigger: ".theatre-prologue", start: "top top", end: "bottom top", scrub: 0.6 } });
      gsap.to(".theatre-halo", { scale: 0.7, yPercent: -14, opacity: 0.45, ease: "none", scrollTrigger: { trigger: ".theatre-prologue", start: "top top", end: "bottom center", scrub: 0.6 } });
      gsap.from(".story-prompt", { y: 35, opacity: 0.6, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: ".story-prompt", start: "top 85%", once: true } });
    });
    return () => { media.revert(); progress.current.value = 0; };
  }, { scope: root, dependencies: [locale], revertOnUpdate: true });

  const poster = <div className="theatre-poster"><Image src="/posters/meng-po.png" width={500} height={500} priority alt={locale === "zh" ? "孟婆抱着南瓜忘忧汤" : "Meng Po holding her pumpkin brew"} unoptimized /></div>;

  return (
    <main ref={root} className="theatre" lang={locale === "zh" ? "zh-CN" : "en"}>
      <a className="theatre-skip" href="#encounter">{t.skip}</a>
      <header className="theatre-nav">
        <Link href={href("/")} className="theatre-brand" aria-label={t.name}><span>黄泉议会</span><span>Nether Council</span></Link>
        <span className="theatre-season">HALLOWEEN · {t.tagline}</span>
        <button className="theatre-language" aria-label={t.language} onClick={() => setLocale(locale === "zh" ? "en" : "zh")}>{locale === "zh" ? "EN" : "中文"}</button>
      </header>
      <div className="theatre-prologue">
        <div ref={stage} className="theatre-stage" data-model-loaded={loaded} aria-label={t.model} role="img">
          <div className="theatre-halo" /><div className="theatre-plinth" />
          {!loaded && poster}
          <StageBoundary onFailure={onFailure}><Scene progress={progress} onLoaded={onLoaded} paused={paused} reduced={Boolean(reduced)} /></StageBoundary>
          <span className="theatre-model-state" aria-live="polite">{failed ? t.fallback : loaded ? t.model : t.loading}</span>
        </div>
        <section className="theatre-opening" aria-labelledby="theatre-title">
          <h1 id="theatre-title" className={locale === "zh" ? "theatre-display han" : "theatre-display"}><span>{t.title[0]}</span><span>{t.title[1]}</span></h1>
          <div className="theatre-invitation"><p>{t.intro}</p><MotionLink whileHover={{ x: reduced ? 0 : 5 }} whileTap={{ scale: reduced ? 1 : 0.98 }} className="theatre-enter" href={href("/play", "meng-po")}>{t.enter}<Arrow /></MotionLink><a className="theatre-cast-link" href="#cast">{t.castLink}<span className="theatre-arrow-down"><Arrow /></span></a></div>
          <span className="theatre-side-note">A GOOD NIGHT TO LET GO.</span>
        </section>
        <section className="theatre-story" aria-labelledby="story-title"><div className="story-prompt"><h2 id="story-title" className={locale === "zh" ? "theatre-display han" : "theatre-display"}>{t.storyTitle.map(line => <span key={line}>{line}</span>)}</h2><p>{t.story}</p><p className="theatre-interrupt">{t.interrupt}</p></div></section>
      </div>
      <section id="cast" className="theatre-cast" aria-labelledby="cast-title">
        <div className="theatre-cast-heading"><h2 id="cast-title">{t.cast}</h2><p>{t.voices}</p></div>
        <div className="theatre-cast-layout"><div className="theatre-cast-portrait" aria-hidden="true"><Image key={selected} src={getCharacter(selected).posterUrl} width={500} height={500} alt="" unoptimized loading="lazy" /></div><div className="theatre-cast-list">{CHARACTER_IDS.map(id => { const character = getCharacter(id); return <Link key={id} href={href("/play", id)} className="theatre-cast-member" onMouseEnter={() => setSelected(id)} onFocus={() => setSelected(id)} aria-label={`${t.choose}: ${character.name[locale]}`}><span>{character.name[locale]}</span><span className="theatre-cast-role">{character.role[locale].split(" · ")[0]}</span><Arrow /></Link>; })}</div></div>
      </section>
      <section id="encounter" className="theatre-finale" aria-labelledby="gift-title"><div className="theatre-gift-copy"><h2 id="gift-title" className={locale === "zh" ? "theatre-display han" : "theatre-display"}>{t.giftTitle.map(line => <span key={line}>{line}</span>)}</h2><p>{t.gift}</p></div><div className="theatre-last-call"><p>{t.finale}</p><MotionLink whileHover={{ y: reduced ? 0 : -3 }} whileTap={{ scale: reduced ? 1 : 0.98 }} className="theatre-enter" href={href("/play")}>{t.start}<Arrow /></MotionLink><p className="theatre-privacy">{t.privacy}</p></div></section>
      <footer className="theatre-footer"><p>{t.footer}</p><Link href={href("/host")}>{t.host}<Arrow /></Link><span>NETHER COUNCIL</span></footer>
    </main>
  );
}
