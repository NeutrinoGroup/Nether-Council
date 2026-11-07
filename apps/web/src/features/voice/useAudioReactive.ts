"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { subscribeAudioFrame } from "./audio/frames";

export const WAVEFORM_BARS = 16;
export type AudioLevels = {
  user: number; ai: number; userBins: Float32Array; aiBins: Float32Array;
  speakingChannel: "none" | "user" | "ai" | "both";
  // Compatibility with scene lighting; these are not lip-sync data.
  character: number; high: number;
};
type SamplingNode = Pick<AnalyserNode, "fftSize" | "getByteTimeDomainData" | "getByteFrequencyData">;
export type AudioNodes = { input?: SamplingNode; output?: SamplingNode };
type SamplingBuffers = { time?: Uint8Array<ArrayBuffer>; freq?: Uint8Array<ArrayBuffer> };
export const silentLevels = (): AudioLevels => ({
  user: 0, ai: 0, character: 0, high: 0, speakingChannel: "none",
  userBins: new Float32Array(WAVEFORM_BARS), aiBins: new Float32Array(WAVEFORM_BARS),
});
const smooth = (previous: number, target: number) => {
  const next = previous + (target - previous) * (target > previous ? 0.35 : 0.15);
  return next < 0.001 ? 0 : next;
};

// Deterministic, browser-independent sampling. Mutates only caller-owned levels
// and scratch buffers and returns the same levels object. Reuse buffers per frame.
export function sampleDualChannelLevels(nodes: AudioNodes, previous: AudioLevels, buffers: SamplingBuffers = {}, reducedMotion = false): AudioLevels {
  const size = Math.max(nodes.input?.fftSize ?? 0, nodes.output?.fftSize ?? 0);
  if (!buffers.time || buffers.time.length < size) buffers.time = new Uint8Array(size);
  if (!buffers.freq || buffers.freq.length < size / 2) buffers.freq = new Uint8Array(size / 2);
  for (let channel = 0; channel < 2; channel++) {
    const node = channel === 0 ? nodes.input : nodes.output;
    const bins = channel === 0 ? previous.userBins : previous.aiBins;
    let envelope = 0, high = 0;
    if (node) {
      node.getByteTimeDomainData(buffers.time);
      let power = 0;
      for (let i = 0; i < node.fftSize; i++) power += ((buffers.time[i] - 128) / 128) ** 2;
      envelope = smooth(channel === 0 ? previous.user : previous.ai, Math.min(1, Math.sqrt(power / node.fftSize) * 7));
      node.getByteFrequencyData(buffers.freq);
      const count = node.fftSize / 2;
      for (let bar = 0; bar < bins.length; bar++) {
        const start = Math.floor(bar * count / bins.length), end = Math.max(start + 1, Math.floor((bar + 1) * count / bins.length));
        let sum = 0;
        for (let i = start; i < end; i++) sum += buffers.freq[i] / 255;
        bins[bar] = reducedMotion ? 0 : smooth(bins[bar], sum / (end - start));
      }
      // Preserve the scene's 2–8 kHz light response when a live context is available.
      const sampleRate = (node as SamplingNode & { context?: { sampleRate: number } }).context?.sampleRate ?? 48000;
      const start = Math.min(count - 1, Math.ceil(2000 / (sampleRate / node.fftSize)));
      const end = Math.min(count, Math.ceil(8000 / (sampleRate / node.fftSize)));
      for (let i = start; i < end; i++) high += buffers.freq[i] / 255;
      high /= Math.max(1, end - start);
    } else {
      // Missing nodes mean muted/stopped/cleared, not a release tail.
      bins.fill(0);
    }
    if (channel === 0) previous.user = envelope;
    else {
      previous.ai = previous.character = envelope;
      previous.high = node ? smooth(previous.high, high) : 0;
    }
  }
  const user = previous.user > 0.035, ai = previous.ai > 0.035;
  previous.speakingChannel = user ? (ai ? "both" : "user") : (ai ? "ai" : "none");
  return previous;
}

// Reads the existing graph without requesting another microphone. Sampling and
// visual consumers share one visibility-aware frame loop, outside React state.
export function useAudioReactive(readNodes: () => AudioNodes, shared?: MutableRefObject<AudioLevels>) {
  const local = useRef<AudioLevels | null>(null);
  if (local.current === null) local.current = silentLevels();
  const levels = shared ?? local as MutableRefObject<AudioLevels>;
  useEffect(() => {
    const values = levels.current;
    const buffers: SamplingBuffers = {}, empty: AudioNodes = {};
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const unsubscribe = subscribeAudioFrame(() => {
      sampleDualChannelLevels(document.hidden ? empty : readNodes(), values, buffers, reduced.matches);
    }, "sample");
    return () => { unsubscribe(); sampleDualChannelLevels(empty, values, buffers); };
  }, [readNodes, levels]);
  return levels;
}
