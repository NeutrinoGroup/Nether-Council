"use client";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Component, useCallback, useRef, useState, type ReactNode } from "react";
import type { CharacterId, Locale } from "@nether/contracts";
import { getCharacter } from "@nether/party-core";
import { SoulSoupOverlay } from "./SoulSoupOverlay";
import type { SoulSoupView, VoiceView } from "../voice/client";

const Scene = dynamic(() => import("./MengPoScene"), { ssr: false });

export type SceneStats = {
  motion: string;
  mouthLevel: number;
  fps?: number;
  triangles?: number;
  textures?: number;
  drawCalls?: number;
};

export type StageProps = {
  characterId?: CharacterId;
  soup?: SoulSoupView;
  locale: Locale;
  phase: VoiceView["phase"];
  interruptedAt?: number;
  celebrating?: boolean;
  scene?: VoiceView["scene"];
  readRms: () => number;
};

function Poster({ characterId = "meng-po", locale, degraded = false }: { characterId?: CharacterId; locale: Locale; degraded?: boolean }) {
  const meta = getCharacter(characterId);
  const alt = locale === "zh" ? `${meta.name.zh} 形象海报` : `${meta.name.en} character poster`;
  const hint = degraded
    ? (locale === "zh" ? "3D 暂不可用，仍可继续语音。" : "3D is unavailable. Voice still works.")
    : (characterId !== "meng-po" ? (locale === "zh" ? "3D 筹备中，可畅享全双工语音。" : "3D coming soon. Enjoy duplex voice.") : undefined);
  return (
    <div className="character-poster">
      <Image src={meta.posterUrl} width={500} height={500} loading="eager" alt={alt} unoptimized />
      {hint && <p role="status">{hint}</p>}
    </div>
  );
}

class SceneBoundary extends Component<{ children: ReactNode; characterId?: CharacterId; locale: Locale }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <Poster characterId={this.props.characterId} locale={this.props.locale} degraded /> : this.props.children;
  }
}

export function CharacterStage(props: StageProps) {
  const characterId = props.characterId ?? "meng-po";
  const meta = getCharacter(characterId);
  const has3D = characterId === "meng-po" && Boolean(meta.modelUrl);

  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const isLoaded = !has3D || loaded;

  const onFrame = useCallback((stats: SceneStats) => {
    const target = container.current;
    if (!target) return;
    target.dataset.motion = stats.motion;
    target.dataset.mouthLevel = String(stats.mouthLevel);
    if (stats.fps !== undefined) {
      target.dataset.fps = stats.fps.toFixed(1);
      target.dataset.triangles = String(stats.triangles);
      target.dataset.textures = String(stats.textures);
      target.dataset.drawCalls = String(stats.drawCalls);
    }
  }, []);

  const onLoaded = useCallback(() => setLoaded(true), []);

  return (
    <div
      className="character-stage"
      ref={container}
      role="group"
      aria-label={props.locale === "zh" ? `${meta.name.zh} 角色舞台` : `${meta.name.en} character stage`}
      data-model-loaded={isLoaded}
      data-mood={props.scene?.mood ?? "calm"}
      data-ritual={props.scene?.blessing ? "finished" : props.scene?.worry ? "worry" : "idle"}
      data-soul-mood={props.soup?.mood ?? "healing"}
      data-soul-ritual={Boolean(props.soup?.ritual)}
    >
      <SceneBoundary characterId={characterId} locale={props.locale}>
        {!isLoaded && <Poster characterId={characterId} locale={props.locale} />}
        {has3D && (
          <Scene
            {...props}
            onLoaded={onLoaded}
            onFrame={onFrame}
            fallback={<Poster characterId={characterId} locale={props.locale} degraded />}
          />
        )}
      </SceneBoundary>
      {characterId === "meng-po" && <SoulSoupOverlay soup={props.soup} locale={props.locale} />}
    </div>
  );
}
