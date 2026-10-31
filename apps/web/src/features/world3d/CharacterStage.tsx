"use client";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@nether/contracts";
import type { VoiceView } from "../voice/client";
const Scene = dynamic(() => import("./MengPoScene"), { ssr: false });
export type SceneStats = { motion: string; mouthLevel: number; fps?: number; triangles?: number; textures?: number; drawCalls?: number };
export type StageProps = { locale: Locale; phase: VoiceView["phase"]; interruptedAt?: number; celebrating?: boolean; readRms: () => number };
function Poster({ locale, degraded = false }: { locale: Locale; degraded?: boolean }) {
  return <div className="character-poster"><Image src="/posters/meng-po.png" width={500} height={500} loading="eager" alt={locale === "zh" ? "手捧南瓜汤的孟婆" : "Meng Po holding her pumpkin soup"} unoptimized />{degraded && <p role="status">{locale === "zh" ? "3D 暂不可用，仍可继续语音。" : "3D is unavailable. Voice still works."}</p>}</div>;
}
class SceneBoundary extends Component<{ children: ReactNode; locale: Locale }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Poster locale={this.props.locale} degraded /> : this.props.children; }
}
export function CharacterStage(props: StageProps) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const target = container.current;
    if (!target) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "100px" });
    observer.observe(target); return () => observer.disconnect();
  }, []);
  const onFrame = useCallback((stats: SceneStats) => {
    const target = container.current;
    if (!target) return;
    target.dataset.motion = stats.motion; target.dataset.mouthLevel = String(stats.mouthLevel);
    if (stats.fps !== undefined) { target.dataset.fps = stats.fps.toFixed(1); target.dataset.triangles = String(stats.triangles); target.dataset.textures = String(stats.textures); target.dataset.drawCalls = String(stats.drawCalls); }
  }, []);
  const onLoaded = useCallback(() => setLoaded(true), []);
  return <div className="character-stage" ref={container} role="img" aria-label={props.locale === "zh" ? "孟婆 3D 角色" : "Meng Po 3D character"} data-model-loaded={loaded}>
    <SceneBoundary locale={props.locale}>
      {!loaded && <Poster locale={props.locale} />}
      {visible && <Scene {...props} onLoaded={onLoaded} onFrame={onFrame} fallback={<Poster locale={props.locale} degraded />} />}
    </SceneBoundary>
  </div>;
}
