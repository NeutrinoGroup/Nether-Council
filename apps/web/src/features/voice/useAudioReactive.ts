"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

export type AudioLevels = { user: number; character: number; high: number };
export type AudioNodes = { input?: AnalyserNode; output?: AnalyserNode };
export const silentLevels = (): AudioLevels => ({ user: 0, character: 0, high: 0 });

// Reads the existing audio graph. Never requests a second microphone or connects
// input to the speakers. Refs keep FFT updates off React's render path.
export function useAudioReactive(readNodes: () => AudioNodes, shared?: MutableRefObject<AudioLevels>) {
  const local = useRef<AudioLevels>(silentLevels());
  const levels = shared ?? local;
  useEffect(() => {
    const values = levels.current;
    const buffers = new WeakMap<AnalyserNode, { time: Float32Array<ArrayBuffer>; frequency: Uint8Array<ArrayBuffer> }>();
    const sample = (node?: AnalyserNode) => {
      if (!node) return { rms: 0, high: 0 };
      let data = buffers.get(node);
      if (!data) {
        data = { time: new Float32Array(node.fftSize), frequency: new Uint8Array(node.frequencyBinCount) };
        buffers.set(node, data);
      }
      node.getFloatTimeDomainData(data.time);
      node.getByteFrequencyData(data.frequency);
      let power = 0;
      for (const value of data.time) power += value * value;
      // 2–8 kHz speech energy, based on the actual AudioContext sample rate.
      const hzPerBin = node.context.sampleRate / node.fftSize;
      const start = Math.min(data.frequency.length - 1, Math.ceil(2000 / hzPerBin));
      const end = Math.min(data.frequency.length, Math.ceil(8000 / hzPerBin));
      let high = 0;
      for (let i = start; i < end; i++) high += data.frequency[i] / 255;
      return { rms: Math.min(1, Math.sqrt(power / data.time.length) * 7), high: high / Math.max(1, end - start) };
    };
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.1); previous = now;
      const nodes = document.hidden ? {} : readNodes();
      const input = sample(nodes.input), output = sample(nodes.output);
      const targets = { user: input.rms, character: output.rms, high: output.high };
      for (const key of ["user", "character", "high"] as const) {
        const current = values[key];
        const damping = targets[key] > current ? 24 : 9;
        values[key] += (targets[key] - current) * (1 - Math.exp(-damping * dt));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); Object.assign(values, silentLevels()); };
  }, [readNodes, levels]);
  return levels;
}
