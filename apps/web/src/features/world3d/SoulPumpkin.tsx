"use client";
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { SoulSoupView } from "../voice/client";

export const soulColors = { healing: "#f3a45b", angry_support: "#b06bff", laughing: "#ffd46a", mystical: "#a6ead8" };

export function SoulPumpkin({ soup }: { soup?: SoulSoupView }) {
  const bowl = useRef<Group>(null);
  const ashes = useRef<Group>(null);
  const started = useRef<number | undefined>(undefined);
  const reduced = useRef(false);
  const color = soulColors[soup?.mood ?? "healing"];
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { reduced.current = media.matches; };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { started.current = soup?.ritual ? performance.now() : undefined; }, [soup?.ritual?.callId, soup?.ritual]);
  useFrame(({ clock }) => {
    const elapsed = started.current === undefined ? 0 : (performance.now() - started.current) / 1000;
    const drinking = soup?.ritual && !reduced.current ? Math.sin(Math.min(1, elapsed / 2.4) * Math.PI) : 0;
    if (bowl.current) {
      bowl.current.position.y = 0.26 + Number(drinking) * 0.65;
      bowl.current.rotation.x = Number(drinking) * 0.55;
    }
    if (ashes.current) {
      ashes.current.visible = Boolean(soup?.ritual) && elapsed < 4.8 && !reduced.current;
      ashes.current.position.y = 0.5 + elapsed * 0.32;
      ashes.current.rotation.y = clock.elapsedTime * 0.6;
      ashes.current.scale.setScalar(0.4 + elapsed * 0.3);
    }
  });
  return <group position={[0, 0, 0.85]} scale={0.72}>
    <group ref={bowl} position={[0, 0.26, 0]}>
      {Array.from({ length: 8 }, (_, i) => {
        const angle = i / 8 * Math.PI * 2;
        return <mesh key={i} position={[Math.cos(angle) * 0.23, 0, Math.sin(angle) * 0.23]} scale={[0.28, 0.31, 0.28]}>
          <sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#bf531c" roughness={0.72} />
        </mesh>;
      })}
      <mesh position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.35, 32]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} side={2} /></mesh>
      <mesh position={[0, 0.23, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.35, 0.045, 8, 32]} /><meshStandardMaterial color="#df7730" /></mesh>
      {[-1, 1].map(side => <mesh key={side} position={[side * 0.17, 0.04, 0.46]} rotation={[0, 0, side * -0.16]}><circleGeometry args={[0.075, 3]} /><meshBasicMaterial color={color} /></mesh>)}
      <mesh position={[0, -0.12, 0.48]} scale={[1, 0.28, 1]} rotation={[0, 0, Math.PI]}><circleGeometry args={[0.18, 3]} /><meshBasicMaterial color={color} /></mesh>
      <pointLight color={color} intensity={2.4} distance={3} />
    </group>
    <group ref={ashes} visible={false}>
      {Array.from({ length: 28 }, (_, i) => <mesh key={i} position={[Math.sin(i * 2.4) * 0.55, (i % 7) * 0.1, Math.cos(i * 2.4) * 0.45]}><sphereGeometry args={[0.013, 4, 4]} /><meshBasicMaterial color={color} /></mesh>)}
    </group>
  </group>;
}
