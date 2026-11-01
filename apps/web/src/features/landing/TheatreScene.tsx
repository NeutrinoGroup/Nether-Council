"use client";

import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei/core/Gltf";
import type { CharacterId } from "@nether/contracts";
import { Box3, MathUtils, type Group, type Mesh, type PointLight, type AmbientLight, type DirectionalLight } from "three";
import { CameraRig, type EncounterPhase } from "../world3d/CameraRig";
import { HalloweenRelics } from "../world3d/HalloweenRelics";
import { NetherAtmosphere } from "../world3d/NetherAtmosphere";
import type { VoiceView } from "../voice/client";
import type { AudioLevels } from "../voice/useAudioReactive";

type Props = {
  progress: MutableRefObject<{ value: number }>; onLoaded: () => void;
  paused: boolean; reduced: boolean; phase: EncounterPhase; onArrive: () => void;
  voice?: MutableRefObject<VoiceView | undefined>;
  audio: MutableRefObject<AudioLevels>; characterId: CharacterId;
};

function Performer({ progress, onLoaded, reduced, audio, pointer, phase, voice }: Props & { pointer: MutableRefObject<{ x: number; y: number }> }) {
  const { scene } = useGLTF("/models/meng-po.glb");
  // Share immutable GLB geometry/textures with /play, never dispose loader assets.
  const model = useMemo(() => scene.clone(true), [scene]);
  const body = useRef<Group>(null), mouth = useRef<Mesh>(null), lantern = useRef<PointLight>(null);
  const placement = useMemo(() => {
    const box = new Box3().setFromObject(model);
    const scale = 2.9 / (box.max.y - box.min.y);
    return { scale, position: [-(box.min.x + box.max.x) * scale / 2, -box.min.y * scale, -(box.min.z + box.max.z) * scale / 2] as [number, number, number] };
  }, [model]);
  useEffect(onLoaded, [onLoaded]);
  useFrame(({ clock, gl }, delta) => {
    const state = voice?.current;
    const interrupted = state?.interruptedAt !== undefined && performance.now() - state.interruptedAt < 400;
    const listening = phase === "conversation" && (interrupted || state?.phase === "listening");
    const level = { ...audio.current, character: state && state.phase !== "speaking" ? 0 : audio.current.character };
    gl.domElement.dataset.motion = listening ? "listening" : state?.phase ?? "idle";
    gl.domElement.dataset.characterLevel = level.character.toFixed(3);
    gl.domElement.dataset.userLevel = level.user.toFixed(3);
    gl.domElement.dataset.highEnergy = level.high.toFixed(3);
    if (lantern.current) lantern.current.intensity = 3.5 + (reduced ? 0 : Math.sin(clock.elapsedTime * 2.1) * 0.4 + Math.sin(clock.elapsedTime * 6.3) * 0.12) + level.high * 16 + level.character * 3;
    if (mouth.current) {
      mouth.current.visible = level.character > 0.025;
      mouth.current.scale.y = Math.max(0.0001, level.character * 0.018);
    }
    if (!body.current) return;
    const p = reduced || phase !== "landing" ? 0 : progress.current.value;
    const dt = Math.min(delta, 0.1);
    body.current.rotation.z = listening ? -0.04 : 0;
    body.current.rotation.y = MathUtils.damp(body.current.rotation.y, (listening ? -0.2 : -0.12) + p * 0.35 + (reduced ? 0 : pointer.current.x * 0.055), 5, dt);
    // The supplied GLB is baked, without a head skeleton or morph targets.
    // A restrained whole-body nod is honest fallback articulation.
    body.current.rotation.x = MathUtils.damp(body.current.rotation.x, reduced ? 0 : pointer.current.y * 0.012 + Math.sin(clock.elapsedTime * 7) * level.character * 0.012, 8, dt);
  });
  return <group ref={body}>
    <group {...placement}>
      <primitive object={model} dispose={null} />
      <mesh ref={mouth} position={[-0.002, 0.895, 0.080]} scale={[0.015, 0.0001, 0.003]} visible={false}><sphereGeometry args={[1, 16, 10]} /><meshBasicMaterial color="#511a2b" /></mesh>
    </group>
    <pointLight ref={lantern} position={[0.03, 1.55, 0.4]} color="#FF6B00" intensity={4.5} distance={4.5} decay={2} />
  </group>;
}

function VoiceLighting({ voice }: Pick<Props, "voice">) {
  const ambient = useRef<AmbientLight>(null), key = useRef<DirectionalLight>(null);
  useFrame(({ gl }) => {
    const mood = voice?.current?.scene?.mood ?? "calm";
    gl.domElement.dataset.mood = mood;
    const color = mood === "storm" ? "#a48bff" : mood === "warm" ? "#ffc781" : "#ffe6c7";
    if (ambient.current) { ambient.current.color.set(color); ambient.current.intensity = mood === "storm" ? 0.45 : 0.8; }
    if (key.current) { key.current.color.set(color); key.current.intensity = mood === "warm" ? 3.5 : 2.3; }
  });
  return <><ambientLight ref={ambient} intensity={0.8} /><directionalLight ref={key} position={[2, 5, 4]} color="#ffe6c7" intensity={2.3} /></>;
}
export default function TheatreScene(props: Props) {
  const pointer = useRef({ x: 0, y: 0 });
  return <Canvas dpr={[1, 1.5]} frameloop={props.paused ? "never" : "always"} camera={{ position: [-0.95, 1.65, 6.5], fov: 39 }} gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}>
    <CameraRig phase={props.phase} reduced={props.reduced} pointer={pointer} onArrive={props.onArrive} />
    <VoiceLighting voice={props.voice} />
    <directionalLight position={[-3, 2, -2]} color="#85aaa0" intensity={1.7} />
    <HalloweenRelics />
    <NetherAtmosphere intimate={props.phase !== "landing"} reduced={props.reduced} />
    <Suspense fallback={null}>{(props.phase === "landing" || props.characterId === "meng-po") && <Performer {...props} pointer={pointer} />}</Suspense>
  </Canvas>;
}
