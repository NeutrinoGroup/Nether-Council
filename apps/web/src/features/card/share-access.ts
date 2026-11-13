import { z } from "zod";

const Capability = z.strictObject({
  sessionId: z.uuid(),
  token: z.string().max(4096).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
type Capability = z.infer<typeof Capability>;
const memory = new Map<string, Capability>();
const storageKey = (sessionId: string) => `nc_card_share_${sessionId}`;

function forget(sessionId: string) {
  memory.delete(sessionId);
  try { sessionStorage.removeItem(storageKey(sessionId)); } catch { /* Storage can be unavailable. */ }
}

export function rememberCardShare(sessionId: string, value: unknown) {
  const parsed = Capability.safeParse(value && typeof value === "object" ? { sessionId, ...value } : undefined);
  if (!parsed.success || parsed.data.sessionId !== sessionId || parsed.data.expiresAt <= Date.now()) return;
  for (const [key, entry] of memory) if (entry.expiresAt <= Date.now()) forget(key);
  memory.set(sessionId, parsed.data);
  try { sessionStorage.setItem(storageKey(sessionId), JSON.stringify(parsed.data)); } catch { /* The current card retains its capability in memory. */ }
}

export function cardShareHeaders(sessionId: string): Record<string, string> {
  if (!z.uuid().safeParse(sessionId).success) return {};
  let entry = memory.get(sessionId);
  if (!entry) {
    try {
      const raw = sessionStorage.getItem(storageKey(sessionId));
      if (raw && raw.length <= 5000) {
        const parsed = Capability.safeParse(JSON.parse(raw));
        if (parsed.success && parsed.data.sessionId === sessionId) entry = parsed.data;
      }
    } catch { /* No persisted capability is available. */ }
  }
  if (!entry || entry.expiresAt <= Date.now()) { forget(sessionId); return {}; }
  memory.set(sessionId, entry);
  return { "X-Nether-Share": entry.token };
}
