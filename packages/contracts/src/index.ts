import { z } from "zod";
export const PROTOCOL_VERSION = 1 as const;
export const MAX_MESSAGE_BYTES = 65_536;
export const Locale = z.enum(["zh", "en"]);
export const CharacterId = z.enum(["hei-wuchang", "bai-wuchang", "zhong-kui", "meng-po", "frankenstein", "werewolf", "vampire"]);
export type Locale = z.infer<typeof Locale>;
export type CharacterId = z.infer<typeof CharacterId>;
export const Localized = z.strictObject({ zh: z.string().min(1), en: z.string().min(1) });
export type Localized = z.infer<typeof Localized>;
const Id = z.uuid();
export const Session = z.strictObject({
  id: Id, characterId: CharacterId, locale: Locale, mode: z.enum(["personal", "host"]),
  createdAt: z.number().int().nonnegative(), captureUntil: z.number().int(), expiresAt: z.number().int(),
}).refine(s => s.captureUntil > s.createdAt && s.captureUntil <= s.createdAt + 180_000 && s.expiresAt > s.captureUntil && s.expiresAt <= s.createdAt + 235_000, "Invalid absolute session bounds");
export type Session = z.infer<typeof Session>;
export const Character = z.strictObject({ id: CharacterId, name: Localized, introduction: Localized, enabled: z.boolean(), modelUrl: z.string().startsWith("/models/").optional(), posterUrl: z.string().startsWith("/posters/").optional() });
export const Caption = z.strictObject({ sessionId: Id, epoch: z.number().int().nonnegative(), responseId: z.string().max(160), segmentId: z.string().max(160), revision: z.number().int().nonnegative(), speaker: z.enum(["user", "character"]), sourceLocale: Locale, sourceText: z.string().max(3000), translatedText: z.string().max(3000).optional(), final: z.boolean() });
export type Caption = z.infer<typeof Caption>;
export const CaptionTranslation = Caption.omit({ translatedText: true }).extend({
  final: z.literal(true), status: z.enum(["ready", "unavailable"]), translatedText: z.string().min(1).max(3000).optional(),
}).refine(t => t.status === "ready" ? t.translatedText !== undefined : t.translatedText === undefined, "Invalid translation status");
export type CaptionTranslation = z.infer<typeof CaptionTranslation>;
export const ConfirmedTurn = z.strictObject({ id: z.string().min(1).max(160), speaker: z.enum(["user", "character"]), locale: Locale, text: z.string().min(1).max(600), revision: z.number().int().nonnegative() });
export type ConfirmedTurn = z.infer<typeof ConfirmedTurn>;
export const EncounterDraft = z.strictObject({ sessionId: Id, characterId: CharacterId, locale: Locale, nickname: z.string().max(48), createdAt: z.number().int(), endedAt: z.number().int(), turns: z.array(ConfirmedTurn).min(1).max(16) });
export type EncounterDraft = z.infer<typeof EncounterDraft>;
const boundedPair = (zh: number, en: number) => z.strictObject({ zh: z.string().min(1).max(zh), en: z.string().min(1).max(en) });
export const ResultContent = z.strictObject({ title: boundedPair(18, 64), verdict: boundedPair(60, 180), warmClosing: boundedPair(50, 160), tags: z.array(boundedPair(10, 28)).min(2).max(3), sourceTurnIds: z.array(z.string().min(1).max(160)).min(1).max(8) });
export type ResultContent = z.infer<typeof ResultContent>;
export const IdentityResult = ResultContent.extend({ id: Id, sessionId: Id, characterId: CharacterId, generatedAt: z.number().int(), fallback: z.boolean() });
export type IdentityResult = z.infer<typeof IdentityResult>;
export const ErrorCode = z.enum(["INVALID_MESSAGE", "SESSION_MISMATCH", "SESSION_EXPIRED", "FORBIDDEN", "VOICE_DISABLED", "UPSTREAM_UNAVAILABLE", "RATE_LIMITED", "NO_STORY", "RESULT_FAILED", "AUDIO_UNAVAILABLE"]);
export const AppError = z.strictObject({ code: ErrorCode, retryable: z.boolean(), message: Localized });
const envelope = { protocolVersion: z.literal(1), eventId: Id, sessionId: Id, epoch: z.number().int().nonnegative(), seq: z.number().int().nonnegative() };
const pcmBase64 = z.string().min(4).max(60_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
export const UiAction = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("change_mood"), data: z.strictObject({ mood: z.enum(["calm", "warm", "storm", "laughing", "angry_support", "mystical", "healing"]) }) }),
  z.strictObject({ action: z.literal("extract_worry"), data: z.strictObject({ worry: z.string().min(1).max(160) }) }),
  z.strictObject({ action: z.literal("finish_ritual"), data: z.strictObject({ blessing: z.string().min(1).max(160) }) }),
]);
export type UiAction = z.infer<typeof UiAction>;
export const SoulMood = z.enum(["laughing", "angry_support", "mystical", "healing"]);
export type SoulMood = z.infer<typeof SoulMood>;
export const SoulAction = z.discriminatedUnion("name", [
  z.strictObject({ name: z.literal("change_mood"), arguments: z.strictObject({ mood: SoulMood }) }),
  z.strictObject({ name: z.literal("extract_worry_keyword"), arguments: z.strictObject({ keyword: z.string().trim().min(1).max(24) }) }),
  z.strictObject({ name: z.literal("trigger_soul_soup_ritual"), arguments: z.strictObject({ blessing_quote: z.string().trim().min(1).max(60) }) }),
]);
export type SoulAction = z.infer<typeof SoulAction>;
export const ClientMessage = z.discriminatedUnion("type", [
  z.strictObject({ ...envelope, type: z.literal("session.start"), resumeTurns: z.array(z.strictObject({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(600) })).max(4).optional(), prewarm: z.boolean().optional(), resumeUserTurns: z.number().int().min(0).max(16).optional(), ritualCompleted: z.boolean().optional() }),
  z.strictObject({ ...envelope, type: z.literal("audio.append"), audio: pcmBase64 }),
  z.strictObject({ ...envelope, type: z.literal("text.submit"), text: z.string().trim().min(1).max(600) }),
  z.strictObject({ ...envelope, type: z.literal("response.cancel"), responseId: z.string().max(160).optional(), playedMs: z.number().int().nonnegative().max(235_000).optional() }),
  z.strictObject({ ...envelope, type: z.literal("session.finalize") }),
  z.strictObject({ ...envelope, type: z.literal("session.end") }),
  z.strictObject({ ...envelope, type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;
export const ServerMessage = z.discriminatedUnion("type", [
  z.strictObject({ ...envelope, type: z.literal("soul.action"), responseId: z.string().min(1).max(160), callId: z.string().min(1).max(160), action: SoulAction }),
  z.strictObject({ ...envelope, type: z.literal("UI_ACTION"), responseId: z.string().min(1).max(160), callId: z.string().min(1).max(160), payload: UiAction }),
  z.strictObject({ ...envelope, type: z.literal("session.ready"), session: Session }),
  z.strictObject({ ...envelope, type: z.literal("speech.started") }),
  z.strictObject({ ...envelope, type: z.literal("speech.stopped") }),
  z.strictObject({ ...envelope, type: z.literal("audio.delta"), responseId: z.string().max(160), audio: pcmBase64 }),
  z.strictObject({ ...envelope, type: z.literal("response.done"), responseId: z.string().max(160) }),
  z.strictObject({ ...envelope, type: z.literal("response.started"), responseId: z.string().max(160) }),
  z.strictObject({ ...envelope, type: z.literal("caption"), caption: Caption }),
  z.strictObject({ ...envelope, type: z.literal("caption.translation"), translation: CaptionTranslation }),
  z.strictObject({ ...envelope, type: z.literal("result"), result: IdentityResult }),
  z.strictObject({ ...envelope, type: z.literal("error"), error: AppError }),
  z.strictObject({ ...envelope, type: z.literal("pong") }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
export const TelemetryEvent = z.strictObject({
  eventId: Id, sessionId: Id.optional(), name: z.enum(["entry_viewed", "conversation_started", "conversation_completed", "card_rendered", "card_download_clicked", "card_download_created", "share_invoked", "invite_copied", "referred_conversation_started", "connection_error", "latency"]),
  at: z.number().int().nonnegative(), characterId: CharacterId.optional(), locale: Locale.optional(),
  sourceSessionId: Id.optional(), metric: z.enum(["connect_ms", "first_audio_ms", "stop_ms", "translation_ms", "result_ms"]).optional(), value: z.number().min(0).max(300_000).optional(),
});
export type TelemetryEvent = z.infer<typeof TelemetryEvent>;
export function parseClientMessage(text: string): ClientMessage {
  if (new TextEncoder().encode(text).byteLength > MAX_MESSAGE_BYTES) throw new Error("INVALID_MESSAGE");
  return ClientMessage.parse(JSON.parse(text));
}
export function validateResultSources(content: ResultContent, knownTurnIds: ReadonlySet<string>) {
  return content.sourceTurnIds.every(id => knownTurnIds.has(id)) && new Set(content.sourceTurnIds).size === content.sourceTurnIds.length;
}
