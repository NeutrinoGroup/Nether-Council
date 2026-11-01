import { getSupabaseServerClient } from "./supabaseServer";

export interface DbUserRecord {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  bio: string | null;
  referral_code: string | null;
  created_at: string;
  updated_at: string;
}

const memoryUsers = new Map<string, DbUserRecord>();

export function generateReferralCode(seed: string): string {
  const clean = seed.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toLowerCase();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `nc_${clean || "spirit"}_${suffix}`;
}

export async function syncUserToDatabase(
  user: Partial<DbUserRecord> & { id: string; email: string; name: string }
): Promise<DbUserRecord> {
  const now = new Date().toISOString();
  const existing = memoryUsers.get(user.id);

  const payload: DbUserRecord = {
    id: user.id,
    email: user.email.toLowerCase().trim(),
    name: user.name.trim(),
    picture: user.picture ?? existing?.picture ?? null,
    bio: user.bio ?? existing?.bio ?? "Visitor of the Nether Council",
    referral_code: user.referral_code ?? existing?.referral_code ?? generateReferralCode(user.id),
    created_at: existing?.created_at ?? user.created_at ?? now,
    updated_at: now,
  };

  memoryUsers.set(payload.id, payload);

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return payload;
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.warn("[UserDb] Supabase upsert notice (fallback to payload):", error.message);
      return payload;
    }
    return data as DbUserRecord;
  } catch (err) {
    console.warn("[UserDb] Exception during syncUserToDatabase:", err);
    return payload;
  }
}

export async function getUserById(id: string): Promise<DbUserRecord | null> {
  if (memoryUsers.has(id)) {
    return memoryUsers.get(id)!;
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) return null;
    const record = data as DbUserRecord;
    memoryUsers.set(record.id, record);
    return record;
  } catch {
    return null;
  }
}

export async function getUserByReferralCode(code: string): Promise<DbUserRecord | null> {
  for (const user of memoryUsers.values()) {
    if (user.referral_code === code) return user;
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("referral_code", code)
      .maybeSingle();

    if (error || !data) return null;
    const record = data as DbUserRecord;
    memoryUsers.set(record.id, record);
    return record;
  } catch {
    return null;
  }
}

export function clearMemoryUsersForTests(): void {
  memoryUsers.clear();
}
