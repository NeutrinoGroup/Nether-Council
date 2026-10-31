import type { Caption, CaptionTranslation, ConfirmedTurn } from "@nether/contracts";
export const CLAIM_PROMPT_MS = 75_000;
export type DisplayCaption = Caption & { translationStatus?: "pending" | "ready" | "unavailable" };
export function applyTranslation(current: DisplayCaption | undefined, translation: CaptionTranslation): DisplayCaption | undefined {
  if (!current?.final || ["sessionId", "epoch", "responseId", "segmentId", "revision", "speaker", "sourceLocale", "sourceText"].some(key => current[key as keyof Caption] !== translation[key as keyof CaptionTranslation])) return current;
  return { ...current, translationStatus: translation.status, translatedText: translation.translatedText };
}
export function isStoryText(text: string): boolean {
  const value = text.trim();
  return (value.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 3 && !/^(?:ok(?:ay)?|yes|no|yeah|sure|thanks|thank you|嗯+|好[的啊呀吧]?|是的|谢谢|不知道|\[(?:noise|silence|inaudible|噪音|静音)\])[.!。！?？\s]*$/i.test(value);
}
export function recordTurn(turns: ConfirmedTurn[], caption: Caption): ConfirmedTurn[] {
  if (!caption.final || !caption.sourceText.trim()) return turns;
  const index = turns.findIndex(t => t.id === caption.segmentId && t.speaker === caption.speaker);
  if (index >= 0 && turns[index].revision >= caption.revision) return turns;
  const turn: ConfirmedTurn = { id: caption.segmentId, speaker: caption.speaker, locale: caption.sourceLocale, text: caption.sourceText.slice(0, 600), revision: caption.revision };
  return (index < 0 ? [...turns, turn] : turns.map((t, i) => i === index ? turn : t)).slice(-16);
}
export function encounterProgress(turns: ConfirmedTurn[], elapsedMs: number) {
  const userTurns = turns.filter(t => t.speaker === "user" && isStoryText(t.text)).length;
  return { userTurns, canClaim: userTurns > 0, claimReady: userTurns >= 2 || (userTurns > 0 && elapsedMs >= CLAIM_PROMPT_MS) };
}
export function normalizeNickname(value: string) { return Array.from(value.replace(/[\p{Cc}\p{Cf}]/gu, "").trim()).slice(0, 24).join(""); }
