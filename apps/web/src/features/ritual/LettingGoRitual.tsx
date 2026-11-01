"use client";
import { useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import type { EncounterDraft, IdentityResult, Locale } from "@nether/contracts";
import { IdentityCard } from "../card/IdentityCard";

gsap.registerPlugin(useGSAP);

export function LettingGoRitual({ result, draft, locale, invite, reduced }: { result: IdentityResult; draft?: EncounterDraft; locale: Locale; invite: string; reduced: boolean }) {
  const [drinking, setDrinking] = useState(false), [released, setReleased] = useState(false);
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  // Preserve actual phrases from the participant; do not invent their worries.
  const worries = useMemo(() => (draft?.turns.filter(t => t.speaker === "user").flatMap(t => t.text.split(/[，。！？,.!?；;]/)).map(t => t.trim()).filter(Boolean).slice(-3) ?? []).map(t => Array.from(t).slice(0, locale === "zh" ? 12 : 36).join("")), [draft, locale]);
  useGSAP(() => {
    if (!drinking) return;
    const el = canvas.current, ctx = el?.getContext("2d");
    const state = { progress: 0 };
    const width = el?.clientWidth ?? 600, height = 220;
    if (el) { el.width = width * 2; el.height = height * 2; }
    const particles = Array.from({ length: 160 }, (_, i) => ({ x: width * ((i * 0.618) % 1), y: 50 + (i % 4) * 28, drift: Math.sin(i * 41) * 100 }));
    const draw = () => {
      if (!ctx) return;
      ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        const t = state.progress;
        // First gather into a seal; then rise as cooling ash.
        const gather = Math.min(1, t * 2.4), burn = Math.max(0, (t - 0.45) / 0.55);
        const x = p.x + (width / 2 - p.x) * gather * 0.7 + p.drift * burn;
        const y = p.y + (90 - p.y) * gather - burn * (80 + (p.x % 70));
        ctx.fillStyle = burn > 0.45 ? `rgba(188,176,160,${1 - burn})` : `rgba(246,161,93,${1 - t * 0.4})`;
        ctx.fillRect(x, y, 2, 2);
      }
    };
    const timeline = gsap.timeline({ defaults: { ease: "power2.inOut" }, onComplete: () => setReleased(true) });
    timeline.to(".ritual-worries", { opacity: 0, y: reduced ? 0 : -30, filter: reduced ? "none" : "blur(12px)", duration: reduced ? 0 : 1.7 }, 0)
      .to(state, { progress: 1, duration: reduced ? 0 : 2.8, onUpdate: draw }, 0)
      .fromTo(".ritual-seal", { opacity: 0, scale: reduced ? 1 : 0.94 }, { opacity: 1, scale: 1, duration: reduced ? 0 : 1.1 }, reduced ? 0 : 1);
  }, { scope: root, dependencies: [drinking, reduced], revertOnUpdate: true });

  return <div ref={root} className="letting-go-ritual" data-released={released}>
    {!drinking ? <>
      <p className="ritual-verdict">{result.verdict[locale]}</p>
      <button className="ritual-drink" onClick={() => setDrinking(true)}>{locale === "zh" ? "干了这碗南瓜孟婆汤" : "Drink the pumpkin brew"}<span aria-hidden="true">↗</span></button>
    </> : <>
      <div className="ritual-burning" aria-hidden="true"><div className="ritual-worries">{worries.map((worry, i) => <span key={i}>{worry}</span>)}</div><canvas ref={canvas} /></div>
      <div className="ritual-seal"><p className="ritual-blessing" role="status">{result.warmClosing[locale]}</p>
        {released && <><p>{locale === "zh" ? "烦恼随灰散去，解忧签留给你。" : "Let the worries turn to ash. Keep your blessing."}</p><IdentityCard result={result} initialNickname={draft?.nickname} locale={locale} invite={invite} /></>}
      </div>
    </>}
  </div>;
}
