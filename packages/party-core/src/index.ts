import type { Caption, IdentityResult, Session } from "@nether/contracts";
export { applyTranslation, encounterProgress, isStoryText, normalizeNickname, recordTurn, CLAIM_PROMPT_MS, type DisplayCaption } from "./encounter";
export const CAPTURE_LIMIT_MS = 180_000;
export const FINALIZE_LIMIT_MS = 30_000;
export const CONNECTION_LIMIT_MS = 235_000;
export const RECONNECT_DELAYS_MS = [1000, 2000, 4000] as const;
export type Phase = "idle" | "connecting" | "listening" | "speaking" | "reconnecting" | "finalizing" | "result" | "error" | "ended";
export type State = { session: Session; phase: Phase; epoch: number; reconnects: number; lastSeq: number; responseId?: string; finalizingAt?: number; result?: IdentityResult };
export type Action = { type: "connect" } | { type: "ready" } | { type: "speak"; responseId: string } | { type: "listen" } | { type: "disconnect" } | { type: "reconnect" } | { type: "finalize" } | { type: "result"; result: IdentityResult } | { type: "end" } | { type: "fail" } | { type: "tick" };
export function initialState(session: Session): State { return { session, phase: "idle", epoch: 0, reconnects: 0, lastSeq: -1 }; }
export function transition(state: State, action: Action, now: number): State {
  if (state.phase === "ended") return state;
  if (now >= state.session.expiresAt || (state.finalizingAt !== undefined && now >= state.finalizingAt + FINALIZE_LIMIT_MS && state.phase === "finalizing")) return { ...state, phase: "ended", responseId: undefined };
  if (action.type === "end") return { ...state, phase: "ended", responseId: undefined };
  if (action.type === "tick") {
    if (now >= state.session.captureUntil && ["listening", "speaking", "connecting", "reconnecting"].includes(state.phase)) return { ...state, phase: "finalizing", finalizingAt: now, responseId: undefined };
    return state;
  }
  const allowed: Record<Action["type"], Phase[]> = {
    connect: ["idle"], ready: ["connecting", "reconnecting"], speak: ["listening", "speaking"], listen: ["speaking", "listening"],
    disconnect: ["connecting", "listening", "speaking", "reconnecting"], reconnect: ["reconnecting"], finalize: ["listening", "speaking"],
    result: ["finalizing", "result"], end: [], fail: ["idle", "connecting", "listening", "speaking", "reconnecting", "finalizing"], tick: [],
  };
  if (!allowed[action.type].includes(state.phase)) throw new Error(`ILLEGAL_TRANSITION:${state.phase}:${action.type}`);
  switch (action.type) {
    case "connect": return { ...state, phase: "connecting" };
    case "ready": return { ...state, phase: "listening" };
    case "speak": return { ...state, phase: "speaking", responseId: action.responseId };
    case "listen": return { ...state, phase: "listening", responseId: undefined };
    case "disconnect": return { ...state, phase: state.reconnects >= 3 ? "error" : "reconnecting", responseId: undefined };
    case "reconnect":
      if (state.reconnects >= 3) return { ...state, phase: "error" };
      return { ...state, reconnects: state.reconnects + 1, epoch: state.epoch + 1, lastSeq: -1, responseId: undefined };
    case "finalize": return { ...state, phase: "finalizing", finalizingAt: now, responseId: undefined };
    case "result":
      if (action.result.sessionId !== state.session.id || action.result.characterId !== state.session.characterId) throw new Error("SESSION_MISMATCH");
      if (state.result) return state;
      return { ...state, phase: "result", result: action.result };
    case "fail": return { ...state, phase: "error", responseId: undefined };
  }
}
export function acceptsEvent(state: State, event: { sessionId: string; epoch: number; seq: number; responseId?: string }): boolean {
  return !["ended", "error"].includes(state.phase) && event.sessionId === state.session.id && event.epoch === state.epoch && event.seq > state.lastSeq && (event.responseId === undefined || event.responseId === state.responseId);
}
export function updateCaption(previous: Caption | undefined, incoming: Caption, active: { sessionId: string; epoch: number; responseId: string }): Caption | undefined {
  if (incoming.sessionId !== active.sessionId || incoming.epoch !== active.epoch || incoming.responseId !== active.responseId) return previous;
  if (previous && previous.segmentId === incoming.segmentId && previous.revision >= incoming.revision) return previous;
  return incoming;
}
