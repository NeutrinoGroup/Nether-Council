import { expect, test } from "vitest";
import { parseClientMessage, ResultContent, validateResultSources } from "./index";
const message = { protocolVersion: 1, eventId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", epoch: 0, seq: 0, type: "audio.append", audio: "AAAA" };
test("rejects invalid or oversized PCM messages and upstream endpoint injection", () => {
  expect(parseClientMessage(JSON.stringify(message)).type).toBe("audio.append");
  for (const changed of [{ ...message, audio: "invalid!" }, { ...message, audio: "A".repeat(70000) }, { ...message, url: "wss://elsewhere.invalid" }, { ...message, seq: -1 }]) expect(() => parseClientMessage(JSON.stringify(changed))).toThrow();
});
test("result requires bilingual bounded fields and valid real turn references", () => {
  const content = ResultContent.parse({ title: { zh: "会议驱魔师", en: "Meeting Exorcist" }, verdict: { zh: "五场会议也没吸走你的幽默。", en: "Five meetings still could not steal your humor." }, warmClosing: { zh: "今晚把时间还给自己。", en: "Tonight belongs to you." }, tags: [{ zh: "幸存者", en: "Survivor" }, { zh: "夜猫", en: "Night owl" }], sourceTurnIds: ["turn1"] });
  expect(validateResultSources(content, new Set(["turn1"]))).toBe(true);
  expect(validateResultSources({ ...content, sourceTurnIds: ["invented"] }, new Set(["turn1"]))).toBe(false);
  expect(validateResultSources({ ...content, sourceTurnIds: ["turn1", "turn1"] }, new Set(["turn1"]))).toBe(false);
  expect(ResultContent.safeParse({ ...content, title: { zh: "字".repeat(19), en: "Title" } }).success).toBe(false);
});
