"use client";

import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { Locale } from "@nether/contracts";
import type { VoiceView } from "./client";
import { WAVEFORM_BARS, type AudioLevels } from "./useAudioReactive";
import { subscribeAudioFrame } from "./audio/frames";
import "./dual-waveform.css";

type WaveformState = "listening" | "thinking" | "speaking" | "interrupted" | "muted" | "reconnecting" | "ended";
export function deriveWaveformState(view: Pick<VoiceView, "phase" | "muted" | "finalizing" | "interruptedAt">, now = performance.now()): WaveformState {
  if (["idle", "ended", "error"].includes(view.phase)) return "ended";
  if (view.interruptedAt !== undefined && now >= view.interruptedAt && now - view.interruptedAt < 900) return "interrupted";
  if (view.muted) return "muted";
  if (view.phase === "reconnecting" || view.phase === "connecting" || view.phase === "permission") return "reconnecting";
  if (view.phase === "thinking" || view.finalizing) return "thinking";
  if (view.phase === "speaking") return "speaking";
  return "listening";
}
const labels = {
  zh: { listening: "正在听你说", thinking: "正在思考", speaking: "正在说话", interrupted: "已打断，请说", muted: "麦克风已静音", reconnecting: "正在连接", ended: "对话未进行" },
  en: { listening: "Listening to you", thinking: "Thinking", speaking: "Speaking", interrupted: "Interrupted — your turn", muted: "Microphone muted", reconnecting: "Connecting", ended: "Conversation inactive" },
};
const bars = Array.from({ length: WAVEFORM_BARS }, (_, index) => index);

export function DualChannelWaveform({ view, audio, locale, characterName, variant = "stage", bandRef }: {
  view: VoiceView; audio: MutableRefObject<AudioLevels>; locale: Locale; characterName: string;
  variant?: "stage" | "immersive"; bandRef?: RefObject<HTMLDivElement | null>;
}) {
  const local = useRef<HTMLDivElement>(null), container = bandRef ?? local;
  const status = useRef<HTMLElement>(null);
  const state = deriveWaveformState(view);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const userChannel = element.querySelector<HTMLElement>('[data-channel="user"]')!;
    const aiChannel = element.querySelector<HTMLElement>('[data-channel="ai"]')!;
    const userBars = userChannel.querySelectorAll<HTMLElement>(".waveform-bar");
    const aiBars = aiChannel.querySelectorAll<HTMLElement>(".waveform-bar");
    const draw = (now: number) => {
      const currentState = deriveWaveformState(view, now);
      const active = currentState !== "ended" && !document.hidden;
      const interrupted = currentState === "interrupted";
      const user = active && !view.muted ? audio.current.user : 0;
      const ai = active && !interrupted && view.phase === "speaking" ? audio.current.ai : 0;
      const userActive = user > 0.035, aiActive = ai > 0.035;
      if (element.dataset.waveformState !== currentState) element.setAttribute("data-waveform-state", currentState);
      if (status.current && status.current.textContent !== labels[locale][currentState]) status.current.textContent = labels[locale][currentState];
      if (element.dataset.userActive !== String(userActive)) element.setAttribute("data-user-active", String(userActive));
      if (element.dataset.aiActive !== String(aiActive)) element.setAttribute("data-ai-active", String(aiActive));
      userChannel.setAttribute("data-active", String(userActive)); aiChannel.setAttribute("data-active", String(aiActive));
      // Reduced motion retains semantic activity while the bars stay still.
      element.style.setProperty("--user-level", String(reduced.matches ? 0 : user));
      element.style.setProperty("--ai-level", String(reduced.matches ? 0 : ai));
      element.style.setProperty("--level", String(reduced.matches ? 0 : Math.max(user, ai)));
      const thinking = active && (view.phase === "thinking" || view.finalizing) && !interrupted && ai === 0;
      for (let i = 0; i < WAVEFORM_BARS; i++) {
        const pulse = interrupted && active && !view.muted ? Math.max(0, 1 - Math.abs((now - view.interruptedAt!) / 900 * 20 - i) / 3) * 0.35 : 0;
        const breath = thinking ? 0.06 + (1 + Math.sin(now / 1400)) * 0.035 : 0;
        userBars[i].style.setProperty("--bar-scale", String(reduced.matches ? 0 : Math.max(user > 0 ? audio.current.userBins[i] : 0, pulse)));
        aiBars[i].style.setProperty("--bar-scale", String(reduced.matches ? 0 : Math.max(ai > 0 ? audio.current.aiBins[i] : 0, breath)));
      }
    };
    draw(performance.now());
    const unsubscribe = subscribeAudioFrame(draw);
    const motionChanged = () => draw(performance.now());
    reduced.addEventListener("change", motionChanged);
    return () => { unsubscribe(); reduced.removeEventListener("change", motionChanged); };
  }, [audio, container, view, locale]);

  return <div ref={container} className={variant === "stage" ? "audio-band dual-waveform" : "dual-waveform dual-waveform-immersive"}
    role="status" aria-live="polite" aria-atomic="true" aria-label={locale === "zh" ? `你与${characterName}的语音活动` : `Voice activity: you and ${characterName}`}
    data-waveform-state={state} data-muted={view.muted} data-phase={view.phase} data-user-active="false" data-ai-active="false">
    <div className="waveform-channel" data-channel="user" data-active="false">
      <b className="waveform-label">{locale === "zh" ? "你" : "You"}</b>
      <div className="waveform-bars" aria-hidden="true">{bars.map(index => <i key={index} className="waveform-bar" />)}</div>
      <small className="waveform-muted" hidden={!view.muted}>{locale === "zh" ? "已静音" : "Muted"}</small>
    </div>
    <div className="waveform-channel" data-channel="ai" data-active="false">
      <b className="waveform-label">{characterName}</b>
      <div className="waveform-bars" aria-hidden="true">{bars.map(index => <i key={index} className="waveform-bar" />)}</div>
    </div>
    <small className="waveform-status" ref={status}>{labels[locale][state]}</small>
  </div>;
}
