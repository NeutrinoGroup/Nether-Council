import { z } from "zod";
export const PROTOCOL_VERSION = 1 as const;
export const MAX_MESSAGE_BYTES = 65_536;
export const Locale = z.enum(["zh", "en"]);
export const CharacterId = z.enum(["hei-wuchang", "bai-wuchang", "zhong-kui", "meng-po", "frankenstein", "werewolf", "vampire"]);
export type Locale = z.infer<typeof Locale>;
export type CharacterId = z.infer<typeof CharacterId>;
export const Localized = z.strictObject({ zh: z.string().min(1), en: z.string().min(1) });
const Id = z.uuid();
export const Session = z.strictObject({
  id: Id, characterId: CharacterId, locale: Locale, mode: z.enum(["personal", "host"]),
  createdAt: z.number().int().nonnegative(), captureUntil: z.number().int(), expiresAt: z.number().int(),
}).refine(s => s.captureUntil > s.createdAt && s.captureUntil <= s.createdAt + 180_000 && s.expiresAt > s.captureUntil && s.expiresAt <= s.createdAt + 235_000, "Invalid absolute session bounds");
export type Session = z.infer<typeof Session>;
export const Character = z.strictObject({ id: CharacterId, name: Localized, introduction: Localized, enabled: z.boolean(), modelUrl: z.string().startsWith("/models/").optional(), posterUrl: z.string().startsWith("/posters/").optional() });
export const Caption = z.strictObject({ sessionId: Id, epoch: z.number().int().nonnegative(), responseId: z.string().max(160), segmentId: z.string().max(160), revision: z.number().int().nonnegative(), speaker: z.enum(["user", "character"]), sourceLocale: Locale, sourceText: z.string().max(3000), translatedText: z.string().max(3000).optional(), final: z.boolean() });
export type Caption = z.infer<typeof Caption>;
const boundedPair = (zh: number, en: number) => z.strictObject({ zh: z.string().min(1).max(zh), en: z.string().min(1).max(en) });
export const ResultContent = z.strictObject({ title: boundedPair(18, 64), verdict: boundedPair(60, 180), warmClosing: boundedPair(50, 160), tags: z.array(boundedPair(10, 28)).min(2).max(3), sourceTurnIds: z.array(z.string().min(1).max(160)).min(1).max(8) });
export type ResultContent = z.infer<typeof ResultContent>;
export const IdentityResult = ResultContent.extend({ id: Id, sessionId: Id, characterId: CharacterId, generatedAt: z.number().int(), fallback: z.boolean() });
export type IdentityResult = z.infer<typeof IdentityResult>;
export const ErrorCode = z.enum(["INVALID_MESSAGE", "SESSION_MISMATCH", "SESSION_EXPIRED", "FORBIDDEN", "VOICE_DISABLED", "UPSTREAM_UNAVAILABLE", "RATE_LIMITED", "NO_STORY", "RESULT_FAILED", "AUDIO_UNAVAILABLE"]);
export const AppError = z.strictObject({ code: ErrorCode, retryable: z.boolean(), message: Localized });
const envelope = { protocolVersion: z.literal(1), eventId: Id, sessionId: Id, epoch: z.number().int().nonnegative(), seq: z.number().int().nonnegative() };
const pcmBase64 = z.string().min(4).max(60_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
export const ClientMessage = z.discriminatedUnion("type", [
  z.strictObject({ ...envelope, type: z.literal("session.start"), resumeTurns: z.array(z.strictObject({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(600) })).max(4).optional() }),
  z.strictObject({ ...envelope, type: z.literal("audio.append"), audio: pcmBase64 }),
  z.strictObject({ ...envelope, type: z.literal("response.cancel"), responseId: z.string().max(160).optional(), playedMs: z.number().int().nonnegative().max(235_000).optional() }),
  z.strictObject({ ...envelope, type: z.literal("session.finalize") }),
  z.strictObject({ ...envelope, type: z.literal("session.end") }),
  z.strictObject({ ...envelope, type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;
export const ServerMessage = z.discriminatedUnion("type", [
  z.strictObject({ ...envelope, type: z.literal("session.ready"), session: Session }),
  z.strictObject({ ...envelope, type: z.literal("speech.started") }),
  z.strictObject({ ...envelope, type: z.literal("audio.delta"), responseId: z.string().max(160), audio: pcmBase64 }),
  z.strictObject({ ...envelope, type: z.literal("response.done"), responseId: z.string().max(160) }),
  z.strictObject({ ...envelope, type: z.literal("caption"), caption: Caption }),
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
