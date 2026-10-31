import { describe, expect, test } from "vitest";
import { initialState, transition, acceptsEvent, updateCaption } from "./index";
import { Session, type Caption } from "@nether/contracts";
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const session = Session.parse({ id, characterId: "meng-po", locale: "en", mode: "personal", createdAt: 1000, captureUntil: 181000, expiresAt: 236000 });
const ready = () => transition(transition(initialState(session), { type: "connect" }, 1000), { type: "ready" }, 1100);
describe("bounded lifecycle", () => {
  test("cannot receive a result before finalization", () => {
    expect(() => transition(initialState(session), { type: "ready" }, 1000)).toThrow("ILLEGAL_TRANSITION");
  });
  test("reconnect keeps the original expiry and stops after three attempts", () => {
    let state = ready();
    for (let i = 0; i < 3; i++) {
      state = transition(state, { type: "disconnect" }, 2000 + i);
      state = transition(state, { type: "reconnect" }, 3000 + i);
      state = transition(state, { type: "ready" }, 4000 + i);
      expect(state.session.expiresAt).toBe(236000);
    }
    expect(transition(state, { type: "disconnect" }, 5000).phase).toBe("error");
    expect(transition(state, { type: "speak", responseId: "late" }, 236000).phase).toBe("ended");
  });
  test("timebox closes capture even while waiting to reconnect", () => {
    const state = transition(ready(), { type: "disconnect" }, 5000);
    const ending = transition(state, { type: "tick" }, 181000);
    expect(ending.phase).toBe("finalizing");
    expect(transition(ending, { type: "tick" }, 211000).phase).toBe("ended");
  });
  test("rejects old connection, other session, and out-of-order events", () => {
    const state = { ...ready(), epoch: 2, lastSeq: 9, responseId: "current" };
    expect(acceptsEvent(state, { sessionId: other, epoch: 2, seq: 10 })).toBe(false);
    expect(acceptsEvent(state, { sessionId: id, epoch: 1, seq: 10 })).toBe(false);
    expect(acceptsEvent(state, { sessionId: id, epoch: 2, seq: 9 })).toBe(false);
    expect(acceptsEvent(state, { sessionId: id, epoch: 2, seq: 10, responseId: "canceled" })).toBe(false);
    expect(acceptsEvent(state, { sessionId: id, epoch: 2, seq: 10, responseId: "current" })).toBe(true);
  });
  test("late translation cannot replace a new response or a newer revision", () => {
    const caption: Caption = { sessionId: id, epoch: 1, responseId: "a", segmentId: "line1", revision: 2, speaker: "user", sourceLocale: "zh", sourceText: "五场会议", final: true };
    const active = { sessionId: id, epoch: 1, responseId: "a" };
    expect(updateCaption(caption, { ...caption, translatedText: "late", revision: 1 }, active)).toBe(caption);
    expect(updateCaption(caption, { ...caption, responseId: "old", revision: 3 }, active)).toBe(caption);
    expect(updateCaption(caption, { ...caption, translatedText: "Five meetings", revision: 3 }, active)?.translatedText).toBe("Five meetings");
  });
});
test("result is immutable once accepted and cannot cross session boundaries", () => {
  const state = transition(ready(), { type: "finalize" }, 5000);
  const result = { id, sessionId: id, characterId: "meng-po" as const, generatedAt: 5000, fallback: false, title: { zh: "勇者", en: "Brave" }, verdict: { zh: "五场会议后仍然笑着", en: "Smiling after five meetings" }, warmClosing: { zh: "放松一下", en: "Take a break" }, tags: [{ zh: "夜猫", en: "Night owl" }, { zh: "勇敢", en: "Brave" }], sourceTurnIds: ["one"] };
  expect(() => transition(state, { type: "result", result: { ...result, sessionId: other } }, 6000)).toThrow("SESSION_MISMATCH");
  const accepted = transition(state, { type: "result", result }, 6000);
  expect(transition(accepted, { type: "result", result: { ...result, id: other } }, 7000).result?.id).toBe(id);
});
