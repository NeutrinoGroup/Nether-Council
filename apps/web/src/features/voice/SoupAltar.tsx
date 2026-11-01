"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import type { AudioLevels } from "./useAudioReactive";

export function SoupAltar({ audio, reduced }: { audio: MutableRefObject<AudioLevels>; reduced: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current, ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    let frame = 0;
    const draw = (time: number) => {
      const dpr = Math.min(devicePixelRatio, 2), w = element.clientWidth, h = element.clientHeight;
      if (element.width !== w * dpr || element.height !== h * dpr) { element.width = w * dpr; element.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const energy = reduced ? 0 : audio.current.user;
      ctx.save(); ctx.translate(w / 2, h / 2 - 6); ctx.scale(1, 0.38);
      for (let ring = 0; ring < 7; ring++) {
        const radius = 46 + ring * 9;
        ctx.beginPath();
        for (let i = 0; i <= 144; i++) {
          const angle = i / 144 * Math.PI * 2;
          const wave = energy * (Math.sin(angle * 9 + time * 0.004 - ring) * 10 + Math.cos(angle * 5 - time * 0.002) * 6);
          const r = radius + wave;
          if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
          else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.strokeStyle = `rgba(246,161,93,${0.65 - ring * 0.075})`; ctx.lineWidth = 1.6; ctx.stroke();
      }
      ctx.restore();
      // A pumpkin bowl silhouette below the liquid, with a ceremonial foot.
      ctx.beginPath(); ctx.ellipse(w / 2, h / 2 + 3, 105, 38, 0, 0, Math.PI);
      ctx.strokeStyle = "#ad7044"; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w / 2 - 26, h / 2 + 44); ctx.lineTo(w / 2 + 26, h / 2 + 44); ctx.stroke();
      if (!document.hidden) frame = requestAnimationFrame(draw);
    };
    const visibility = () => { cancelAnimationFrame(frame); if (!document.hidden) frame = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", visibility); frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", visibility); };
  }, [audio, reduced]);
  return <canvas ref={canvas} className="soup-altar" aria-hidden="true" />;
}
