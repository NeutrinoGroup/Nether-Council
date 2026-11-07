import { z } from "zod";
import { CharacterId, Locale } from "@nether/contracts";

const STORAGE_KEY = "nc_entry_context";
const MAX_AGE_MS = 10 * 60_000;
const EntryQuery = z.strictObject({
  invite: z.string().min(1).max(4096).optional(),
  ref: z.string().min(1).max(4096).optional(),
  character: CharacterId.optional(),
  lang: Locale.optional(),
});
const EntryContext = z.strictObject({
  path: z.enum(["/", "/play"]),
  query: EntryQuery,
  savedAt: z.number().int().nonnegative(),
});

export function readEntryQuery(search: string): z.infer<typeof EntryQuery> {
  const params = new URLSearchParams(search);
  const query: z.infer<typeof EntryQuery> = {};
  for (const key of ["invite", "ref"] as const) {
    const value = params.get(key);
    if (value && value.length <= 4096) query[key] = value;
  }
  const character = CharacterId.safeParse(params.get("character"));
  const lang = Locale.safeParse(params.get("lang"));
  if (character.success) query.character = character.data;
  if (lang.success) query.lang = lang.data;
  return query;
}

export function rememberEntryContext(
  location: { pathname: string; search: string } | undefined = typeof window === "undefined" ? undefined : window.location,
  now = Date.now(),
) {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    if (!location) return;
    const entry = EntryContext.safeParse({ path: location.pathname, query: readEntryQuery(location.search), savedAt: now });
    if (entry.success) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry.data));
  } catch { /* Login remains available when browser storage is disabled. */ }
}

export function consumeEntryContext(now = Date.now()): string | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (!raw || raw.length > 60_000) return;
    const entry = EntryContext.safeParse(JSON.parse(raw));
    if (!entry.success) return;
    const age = now - entry.data.savedAt;
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return;
    const query = new URLSearchParams(entry.data.query).toString();
    return `${entry.data.path}${query ? `?${query}` : ""}`;
  } catch { return; }
}
