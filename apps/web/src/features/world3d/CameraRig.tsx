"use client";

import { useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { PerspectiveCamera } from "three";

export type EncounterPhase = "landing" | "entering" | "conversation";
gsap.registerPlugin(useGSAP);

export function CameraRig({ phase, reduced, pointer, onArrive }: {
  phase: EncounterPhase; reduced: boolean;
  pointer: MutableRefObject<{ x: number; y: number }>;
  onArrive: () => void;
}) {
  const { size } = useThree();
  const pose = useRef({ x: -0.95, y: 1.65, z: 6.5, targetX: -0.95, targetY: 1.45, fov: 39 });
  const parallax = useRef({ x: 0, y: 0 });
  const compact = size.width < 700;

  const entered = phase !== "landing";
  useGSAP(() => {
    const target = entered
      ? { x: compact ? 0 : -0.25, y: 2.08, z: compact ? 4.1 : 3.7, targetX: compact ? 0 : -0.25, targetY: 1.95, fov: 35 }
      : { x: compact ? 0 : -0.95, y: compact ? 1.95 : 1.65, z: compact ? 9.7 : 6.5, targetX: compact ? 0 : -0.95, targetY: compact ? 1.8 : 1.45, fov: 39 };
    const timeline = gsap.timeline({ defaults: { ease: "power3.inOut", duration: reduced ? 0 : 2.5 } });
    timeline.addLabel("cross-threshold", reduced ? 0 : 0.2)
      .to(pose.current, { ...target }, "cross-threshold")
      .call(() => { if (phase === "entering") onArrive(); });
  }, { dependencies: [entered, compact, reduced, onArrive], revertOnUpdate: true });

  useGSAP(() => {
    if (reduced) { parallax.current.x = 0; parallax.current.y = 0; return; }
    const xTo = gsap.quickTo(parallax.current, "x", { duration: 1.2, ease: "power3.out" });
    const yTo = gsap.quickTo(parallax.current, "y", { duration: 1.2, ease: "power3.out" });
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer.current.x = event.clientX / innerWidth * 2 - 1;
      pointer.current.y = 1 - event.clientY / innerHeight * 2;
      xTo(pointer.current.x * 0.12); yTo(pointer.current.y * 0.07);
    };
    const leave = () => { pointer.current.x = 0; pointer.current.y = 0; xTo(0); yTo(0); };
    window.addEventListener("pointermove", move); document.addEventListener("pointerleave", leave);
    return () => { window.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave); };
  }, { dependencies: [reduced], revertOnUpdate: true });

  useFrame(({ camera, gl }) => {
    gl.domElement.dataset.cameraZ = camera.position.z.toFixed(3);
    const p = pose.current, offset = parallax.current;
    camera.position.set(p.x + offset.x, p.y + offset.y, p.z);
    camera.lookAt(p.targetX, p.targetY, 0);
    if (camera instanceof PerspectiveCamera && camera.fov !== p.fov) {
      camera.fov = p.fov; camera.updateProjectionMatrix();
    }
  });
  return null;
}
