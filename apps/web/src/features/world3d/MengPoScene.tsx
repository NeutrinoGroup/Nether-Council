"use client";
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei/core/Gltf";
import { Box3, MathUtils, type Group, type Mesh, type Material, type Texture } from "three";
import type { SceneStats, StageProps } from "./CharacterStage";
const modelUrl = "/models/meng-po.glb";
type Props = StageProps & { onLoaded: () => void; onFrame: (stats: SceneStats) => void; fallback: ReactNode };
function disposeModel(scene: Group) {
  const textures = new Set<Texture>(); const materials = new Set<Material>();
  scene.traverse(object => {
    const mesh = object as Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value && typeof value === "object" && "isTexture" in value) textures.add(value as Texture);
    }
  });
  textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose());
}
function Model({ phase, interruptedAt, celebrating, readRms, onLoaded, onFrame }: Props) {
  const { scene } = useGLTF(modelUrl);
  const body = useRef<Group>(null); const mouth = useRef<Mesh>(null);
  const reduced = useRef(false);
  const timing = useRef({ last: 0, started: 0, frames: 0 });
  const placement = useMemo(() => {
    const bounds = new Box3().setFromObject(scene); const s = 2.5 / (bounds.max.y - bounds.min.y);
    return { scale: s, position: [-(bounds.min.x + bounds.max.x) * s / 2, -bounds.min.y * s, -(bounds.min.z + bounds.max.z) * s / 2] as [number, number, number] };
  }, [scene]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)"); const update = () => { reduced.current = media.matches; }; update(); media.addEventListener("change", update);
    onLoaded();
    return () => { media.removeEventListener("change", update); disposeModel(scene); useGLTF.clear(modelUrl); };
  }, [scene, onLoaded]);
  useFrame(({ clock, gl }, delta) => {
    const now = clock.elapsedTime; const t = timing.current;
    if (!t.started) t.started = now;
    t.frames++;
    const performanceStats = now - t.started >= 2 ? { fps: t.frames / (now - t.started), triangles: gl.info.render.triangles, textures: gl.info.memory.textures, drawCalls: gl.info.render.calls } : {};
    if (performanceStats.fps !== undefined) { t.started = now; t.frames = 0; }
    const level = Math.min(1, Math.max(0, readRms() * 7));
    const interrupted = interruptedAt !== undefined && performance.now() - interruptedAt < 400;
    const state = celebrating ? "celebrating" : interrupted ? "interrupted" : phase === "speaking" ? "speaking" : phase === "listening" ? "listening" : "idle";
    onFrame({ motion: state, mouthLevel: level, ...performanceStats });
    if (mouth.current) {
      mouth.current.visible = level > 0.015;
      mouth.current.scale.set(0.015, Math.max(0.0001, level * 0.016), 0.003);
    }
    if (now - t.last < 1 / 30) return;
    t.last = now;
    if (body.current) {
      const move = reduced.current ? 0 : 1;
      const targetY = move * (celebrating ? Math.sin(now * 8) * 0.035 : Math.sin(now * 1.4) * 0.006);
      body.current.position.y = targetY;
      body.current.rotation.y = MathUtils.damp(body.current.rotation.y, move * (interrupted ? -0.035 : state === "listening" ? 0.025 : Math.sin(now * 0.5) * 0.012), 9, Math.min(delta, 0.1));
    }
  });
  return <group ref={body}><group scale={placement.scale} position={placement.position}>
    <primitive object={scene} dispose={null} />
    {/* Source GLB is a single baked mesh without a face rig. This independent mouth never stretches the body. */}
    <mesh ref={mouth} position={[-0.002, 0.895, 0.080]} visible={false}><sphereGeometry args={[1, 16, 10]} /><meshBasicMaterial color="#511a2b" /></mesh>
  </group></group>;
}
export default function MengPoScene(props: Props) {
  return <Canvas dpr={[1, 1.5]} camera={{ position: [0, 1.45, 4.2], fov: 39 }} gl={{ antialias: true, alpha: true, powerPreference: "low-power" }} fallback={props.fallback} onCreated={({ camera }) => camera.lookAt(0, 1.3, 0)}>
    <ambientLight intensity={1.7} /><directionalLight position={[3, 5, 4]} intensity={2.5} /><directionalLight position={[-3, 2, -1]} intensity={1.1} />
    <Suspense fallback={null}><Model {...props} /></Suspense>
  </Canvas>;
}
