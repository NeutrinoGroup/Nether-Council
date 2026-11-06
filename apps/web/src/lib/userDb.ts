import { createHash } from "node:crypto";
import { getSupabaseServerClient } from "./supabaseServer";
export interface DbUserRecord {
  id: string; email: string; name: string; picture: string | null; bio: string | null;
  referral_code: string | null; created_at: string; updated_at: string;
}
const memoryUsers = new Map<string, DbUserRecord>();
export function generateReferralCode(seed: string): string { return `nc_${createHash("sha256").update(seed).digest("hex").slice(0, 24)}`; }
export async function syncUserToDatabase(user: Partial<DbUserRecord> & { id: string; email: string; name: string }): Promise<DbUserRecord> {
  const existing = await getUserById(user.id); const now = new Date().toISOString();
  const payload: DbUserRecord = { id: user.id, email: user.email.toLowerCase().trim(), name: user.name.trim(), picture: user.picture ?? existing?.picture ?? null, bio: user.bio ?? existing?.bio ?? "Visitor of the Nether Council", referral_code: user.referral_code ?? existing?.referral_code ?? generateReferralCode(user.id), created_at: existing?.created_at ?? now, updated_at: now };
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    if (process.env.NODE_ENV === "production") throw new Error("DATABASE_UNAVAILABLE");
    memoryUsers.set(payload.id, payload); return payload;
  }
  try {
    const { data, error } = await supabase.from("users").upsert(payload, { onConflict: "id" }).select().single();
    if (error || !data) throw new Error("DATABASE_UNAVAILABLE");
    return data as DbUserRecord;
  } catch { throw new Error("DATABASE_UNAVAILABLE"); }
}
export async function getUserById(id: string): Promise<DbUserRecord | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    if (process.env.NODE_ENV === "production") throw new Error("DATABASE_UNAVAILABLE");
    return memoryUsers.get(id) || null;
  }
  try {
    const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error("DATABASE_UNAVAILABLE");
    return data as DbUserRecord | null;
  } catch { throw new Error("DATABASE_UNAVAILABLE"); }
}
export async function getUserByReferralCode(code: string): Promise<DbUserRecord | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    if (process.env.NODE_ENV === "production") throw new Error("DATABASE_UNAVAILABLE");
    return [...memoryUsers.values()].find(user => user.referral_code === code) || null;
  }
  try {
    const { data, error } = await supabase.from("users").select("*").eq("referral_code", code).maybeSingle();
    if (error) throw new Error("DATABASE_UNAVAILABLE");
    return data as DbUserRecord | null;
  } catch { throw new Error("DATABASE_UNAVAILABLE"); }
}
export function clearMemoryUsersForTests(): void { memoryUsers.clear(); }
