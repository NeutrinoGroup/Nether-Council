import { preloadAudioWorklet } from "./audio/module";
import type { Locale, UiAction } from "@nether/contracts";

// Recorded speech ships with the app. No TTS/network service is needed during fallback.
// These are explicitly scripted highlights, never a generated interpretation of the guest.
export const demoLines = {
  zh: ["客官，先把烦恼放在这碗汤里。今晚，孟婆听你慢慢说。", "原来让你累的，是总也开不完的会。这份烦恼我收下了，把时间还给你自己。", "汤已温，灯已亮。愿你放下今天的疲惫，明天醒来，心里轻一点。"],
  en: ["Welcome, traveler. Leave your worries by this bowl. Tonight, Meng Po is listening.", "Those endless meetings have worn you out. Leave that worry here, and take some time back for yourself.", "The soup is warm, and the lantern is lit. Leave today behind. May tomorrow feel a little lighter."],
};
const clips = new Map<string, Promise<string>>();
export function demoAudio(locale: Locale, step: number): Promise<string> {
  const path = `/demo/${locale}-${step}.pcm`;
  let clip = clips.get(path);
  if (!clip) {
    clip = fetch(path, { cache: "force-cache" }).then(async response => {
      if (!response.ok) throw new Error("DEMO_ASSET_UNAVAILABLE");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length % 2 || bytes.length > 576000) throw new Error("DEMO_ASSET_INVALID");
      let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    }).catch(error => { clips.delete(path); throw error; });
    clips.set(path, clip);
  }
  return clip;
}
export function preloadDemo(locale: Locale) {
  void preloadAudioWorklet().catch(() => {});
  for (let i = 0; i < 3; i++) void demoAudio(locale, i).catch(() => {});
}
export function demoAction(locale: Locale, step: number): UiAction {
  if (step === 1) return { action: "extract_worry", data: { worry: locale === "zh" ? "开不完的会" : "Endless meetings" } };
  if (step === 2) return { action: "finish_ritual", data: { blessing: locale === "zh" ? "愿明天心里轻一点" : "May tomorrow feel lighter" } };
  return { action: "change_mood", data: { mood: "warm" } };
}
