"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import type { AudioLevels } from "./useAudioReactive";
import type { SoulSoupView } from "./client";
import { subscribeAudioFrame } from "./audio/frames";
import { soulColors } from "../world3d/soul-colors";

export function SoupAltar({ audio, reduced, soup }: { audio: MutableRefObject<AudioLevels>; reduced: boolean; soup?: SoulSoupView }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current, ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    const color = soulColors[soup?.mood ?? "healing"];
    const draw = (time: number) => {
      const dpr = Math.min(devicePixelRatio, 2), w = element.clientWidth, h = element.clientHeight;
      if (element.width !== w * dpr || element.height !== h * dpr) { element.width = w * dpr; element.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const user = reduced || document.hidden ? 0 : audio.current.user;
      const ai = reduced || document.hidden ? 0 : audio.current.ai;
      const travel = reduced ? 0 : (time % 1800) / 1800;
      ctx.save(); ctx.translate(w / 2, h / 2 - 6); ctx.scale(1, 0.38);
      for (let ring = 0; ring < 7; ring++) {
        // Guest energy gathers toward the bowl; the reply travels outward.
        const radius = 46 + ring * 9 - user * (travel * 18 + (6 - ring) * 1.5) + ai * travel * 22;
        ctx.beginPath();
        for (let i = 0; i <= 144; i++) {
          const angle = i / 144 * Math.PI * 2;
          const wave = user * Math.sin(angle * 9 + time * 0.004 + ring) * 8
            + ai * Math.sin(angle * 5 - time * 0.003 - ring) * 5;
          const r = radius + wave;
          if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
          else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.globalAlpha = Math.min(1, 0.65 - ring * 0.075 + ai * 0.2);
        ctx.strokeStyle = color; ctx.lineWidth = 1.6 + ai * 1.4;
        ctx.shadowColor = "#efbc82"; ctx.shadowBlur = ai * 12; ctx.stroke();
      }
      ctx.restore();
      // A pumpkin bowl silhouette below the liquid, with a ceremonial foot.
      ctx.beginPath(); ctx.ellipse(w / 2, h / 2 + 3, 105, 38, 0, 0, Math.PI);
      ctx.strokeStyle = "#ad7044"; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w / 2 - 26, h / 2 + 44); ctx.lineTo(w / 2 + 26, h / 2 + 44); ctx.stroke();
    };
    draw(performance.now());
    if (!reduced) return subscribeAudioFrame(draw);
    // A still bowl only redraws when resized, including mobile orientation changes.
    const resize = new ResizeObserver(() => draw(0));
    resize.observe(element);
    return () => resize.disconnect();
  }, [audio, reduced, soup?.mood]);
  return <canvas ref={canvas} className="soup-altar" aria-hidden="true" />;
}
