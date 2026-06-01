import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/db/types";

/** Returns the authenticated user (validated JWT) or null. Never uses getSession(). */
export async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/** Returns { user, profile } or null if unauthenticated. */
export async function getUserAndProfile(): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getUser>>>; profile: Profile | null } | null> {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
  return { user, profile: profile as Profile | null };
}

/** True when the signed-in user is the configured admin. */
export async function isAdmin(): Promise<boolean> {
  const ctx = await getUserAndProfile();
  return !!ctx?.profile?.is_admin;
}

/**
 * Promote the configured admin email to is_admin. Idempotent; runs via service role
 * after sign-in (the DB cannot know ADMIN_EMAIL on its own).
 */
export async function ensureAdminFlag(userId: string, email: string | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!adminEmail || !email || email.toLowerCase() !== adminEmail) return;
  const admin = createAdminClient();
  await admin.from("profiles").update({ is_admin: true }).eq("user_id", userId);
}
