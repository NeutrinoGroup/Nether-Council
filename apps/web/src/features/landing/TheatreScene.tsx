"use client";

import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei/core/Gltf";
import { Box3, MathUtils, type Group } from "three";

type Props = { progress: MutableRefObject<{ value: number }>; onLoaded: () => void; paused: boolean; reduced: boolean };

function Performer({ progress, onLoaded, reduced }: Props) {
  const { scene } = useGLTF("/models/meng-po.glb");
  // /play uses the same loader cache. Do not dispose its shared geometry/textures.
  const model = useMemo(() => scene.clone(true), [scene]);
  const turn = useRef<Group>(null);
  const placement = useMemo(() => {
    const box = new Box3().setFromObject(model);
    const scale = 2.9 / (box.max.y - box.min.y);
    return { scale, position: [-(box.min.x + box.max.x) * scale / 2, -box.min.y * scale, -(box.min.z + box.max.z) * scale / 2] as [number, number, number] };
  }, [model]);
  useEffect(onLoaded, [onLoaded]);
  useFrame((_, delta) => {
    if (!turn.current) return;
    const p = reduced ? 0 : progress.current.value;
    turn.current.rotation.y = MathUtils.damp(turn.current.rotation.y, -0.19 + p * 0.9, 5, Math.min(delta, 0.1));
    turn.current.position.y = MathUtils.damp(turn.current.position.y, -p * 0.16, 5, Math.min(delta, 0.1));
  });
  return <group ref={turn}><group {...placement}><primitive object={model} dispose={null} /></group></group>;
}

export default function TheatreScene(props: Props) {
  return <Canvas dpr={[1, 1.25]} frameloop={props.paused ? "never" : props.reduced ? "demand" : "always"} camera={{ position: [0, 1.6, 5.5], fov: 39 }} gl={{ alpha: true, antialias: true, powerPreference: "low-power" }} onCreated={({ camera }) => camera.lookAt(0, 1.4, 0)}>
    <ambientLight intensity={1.3} />
    <directionalLight position={[2, 5, 4]} color="#ffe6c7" intensity={3.1} />
    <directionalLight position={[-3, 2, -2]} color="#f59652" intensity={1.6} />
    <Suspense fallback={null}><Performer {...props} /></Suspense>
  </Canvas>;
}
