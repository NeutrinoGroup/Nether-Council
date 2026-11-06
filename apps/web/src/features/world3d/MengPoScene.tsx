"use client";
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei/core/Gltf";
import { Box3, MathUtils, type Group } from "three";
import { getCharacter } from "@nether/party-core";
import { SoulPumpkin } from "./SoulPumpkin";
import type { SceneStats, StageProps } from "./CharacterStage";
const modelUrl = getCharacter("meng-po").modelUrl!;
type Props = StageProps & { onLoaded: () => void; onFrame: (stats: SceneStats) => void; fallback: ReactNode };
function Model({ phase, interruptedAt, celebrating: hostCelebrating, scene: sceneState, soup, readRms, onLoaded, onFrame }: Props) {
  const celebrating = hostCelebrating || Boolean(sceneState?.blessing);
  const { scene: cachedScene } = useGLTF(modelUrl);
  const scene = useMemo(() => cachedScene.clone(true), [cachedScene]);
  const body = useRef<Group>(null);
  const reduced = useRef(false);
  const timing = useRef({ last: 0, started: 0, frames: 0 });
  const placement = useMemo(() => {
    const bounds = new Box3().setFromObject(scene); const s = 2.5 / (bounds.max.y - bounds.min.y);
    return { scale: s, position: [-(bounds.min.x + bounds.max.x) * s / 2, -bounds.min.y * s, -(bounds.min.z + bounds.max.z) * s / 2] as [number, number, number] };
  }, [scene]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)"); const update = () => { reduced.current = media.matches; }; update(); media.addEventListener("change", update);
    onLoaded();
    return () => { media.removeEventListener("change", update); };
  }, [scene, onLoaded]);
  useFrame(({ clock, gl }, delta) => {
    const now = clock.elapsedTime; const t = timing.current;
    if (!t.started) t.started = now;
    t.frames++;
    const performanceStats = now - t.started >= 2 ? { fps: t.frames / (now - t.started), triangles: gl.info.render.triangles, textures: gl.info.memory.textures, drawCalls: gl.info.render.calls } : {};
    if (performanceStats.fps !== undefined) { t.started = now; t.frames = 0; }
    const level = Math.min(1, Math.max(0, readRms() * 7));
    const interrupted = interruptedAt !== undefined && performance.now() - interruptedAt < 400;
    const state = interrupted ? "listening" : celebrating ? "celebrating" : phase === "speaking" ? "speaking" : phase === "listening" ? "listening" : "idle";
    onFrame({ motion: state, mouthLevel: level, ...performanceStats });
    if (now - t.last < 1 / 30) return;
    t.last = now;
    if (body.current) {
      const move = reduced.current ? 0 : 1;
      const targetY = move * (celebrating || soup?.mood === "laughing" ? Math.sin(now * 8) * 0.035 : Math.sin(now * 1.4) * 0.006);
      body.current.position.y = targetY;
      body.current.rotation.z = interrupted || state === "listening" ? -0.04 : 0;
      body.current.rotation.y = MathUtils.damp(body.current.rotation.y, move * (interrupted ? -0.035 : state === "listening" ? 0.025 : Math.sin(now * 0.5) * 0.012), 9, Math.min(delta, 0.1));
    }
  });
  return <group ref={body}><group scale={placement.scale} position={placement.position}>
    <primitive object={scene} dispose={null} />

  </group></group>;
}
export default function MengPoScene(props: Props) {
  const mood = props.scene?.mood ?? "calm";
  const color = mood === "storm" ? "#a48bff" : mood === "warm" ? "#ffc781" : "#b5d8ff";
  return <Canvas dpr={[1, 1.5]} camera={{ position: [0, 1.45, 4.2], fov: 39 }} gl={{ antialias: true, alpha: true, powerPreference: "low-power" }} fallback={props.fallback} onCreated={({ camera }) => camera.lookAt(0, 1.3, 0)}>
    <ambientLight intensity={mood === "storm" ? 0.8 : 1.7} color={color} /><directionalLight position={[3, 5, 4]} intensity={mood === "warm" ? 3.5 : 2.5} color={color} /><directionalLight position={[-3, 2, -1]} intensity={1.1} />
    <Suspense fallback={null}><Model {...props} /><SoulPumpkin soup={props.soup} /></Suspense>
  </Canvas>;
}
