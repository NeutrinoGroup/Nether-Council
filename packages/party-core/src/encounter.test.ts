import { expect, test } from "vitest";
import type { Caption, CaptionTranslation } from "@nether/contracts";
import { applyTranslation, encounterProgress, normalizeNickname, recordTurn } from "./encounter";
const caption: Caption = { sessionId: "11111111-1111-4111-8111-111111111111", epoch: 0, responseId: "user-1", segmentId: "user-1", revision: 1, sourceLocale: "en", sourceText: "Five meetings today and zero work done.", speaker: "user", final: true };
test("claim needs a story; two turns or 75 seconds suggest a bounded ending", () => {
  for (const text of ["", "...", "嗯嗯嗯", "okay", "thank you", "[noise]"]) expect(encounterProgress(recordTurn([], { ...caption, sourceText: text }), 90_000).canClaim).toBe(false);
  const turns = recordTurn([], caption);
  expect(encounterProgress(turns, 74_999)).toEqual({ userTurns: 1, canClaim: true, claimReady: false });
  expect(encounterProgress(turns, 75_000).claimReady).toBe(true);
  expect(encounterProgress(recordTurn(turns, { ...caption, segmentId: "user-2" }), 5000)).toEqual({ userTurns: 2, canClaim: true, claimReady: true });
});
test("only confirmed turns count; duplicate finals and corrections do not inflate progress", () => {
  expect(recordTurn([], { ...caption, final: false })).toEqual([]);
  const turns = recordTurn([], caption);
  expect(recordTurn(turns, caption)).toBe(turns);
  const corrected = recordTurn(turns, { ...caption, revision: 2, sourceText: "Actually six meetings." });
  expect(corrected).toHaveLength(1); expect(corrected[0].text).toBe("Actually six meetings.");
  expect(recordTurn(corrected, caption)).toBe(corrected);
  let bounded = corrected;
  for (let i = 0; i < 20; i++) bounded = recordTurn(bounded, { ...caption, segmentId: `turn-${i}`, sourceText: "x".repeat(900) });
  expect(bounded).toHaveLength(16); expect(bounded[0].text).toHaveLength(600);
});
test("translation must match every source identity field and a confirmed source", () => {
  const translated: CaptionTranslation = { ...caption, final: true, status: "ready", translatedText: "今天开了五场会。" };
  expect(applyTranslation(caption, translated)).toMatchObject({ translationStatus: "ready", translatedText: translated.translatedText });
  for (const patch of [{ sessionId: crypto.randomUUID() }, { epoch: 1 }, { responseId: "old" }, { segmentId: "old" }, { revision: 0 }, { speaker: "character" as const }, { sourceLocale: "zh" as const }, { sourceText: "old words" }]) expect(applyTranslation(caption, { ...translated, ...patch })).toBe(caption);
  const partial = { ...caption, final: false }; expect(applyTranslation(partial, translated)).toBe(partial);
  expect(applyTranslation(undefined, translated)).toBeUndefined();
  expect(applyTranslation(caption, { ...translated, status: "unavailable", translatedText: undefined })).toMatchObject({ translationStatus: "unavailable", translatedText: undefined });
});
test("nickname length counts Unicode characters and strips control characters", () => {
  expect(normalizeNickname("  小\u0000南\u202e瓜  ")).toBe("小南瓜");
  expect(Array.from(normalizeNickname("🎃".repeat(30)))).toHaveLength(24);
});
