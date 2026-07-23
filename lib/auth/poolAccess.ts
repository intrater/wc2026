// Post-lock pool access (user decision 2026-06-07): once the tournament is live,
// pool pages are for entrants (submitted entry), viewers (profiles.is_viewer,
// e.g. a friend co-owning an entry — migration 0007), and the admin. Pre-lock,
// everything stays public — the homepage is the signup funnel.
// RLS (migration 0004) enforces the same rule at the data layer; this helper is
// the page-level mirror so outsiders get a clear destination instead of empty data.
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/server";
import { getPhase } from "@/lib/state/phase";
import { isArchive } from "@/lib/archive";

export type PoolAccess = "ok" | "signin" | "no-entry";

export async function checkPoolAccess(): Promise<PoolAccess> {
  // Frozen archive: the tournament is over and the snapshot is public — no gating.
  if (isArchive) return "ok";

  const phase = await getPhase();
  if (!phase.isLocked) return "ok";

  const user = await getUser();
  if (!user) return "signin";

  const supabase = await createClient();
  const [{ data: entry }, { data: profile }] = await Promise.all([
    supabase
      .from("entries")
      .select("submitted_at")
      .eq("user_id", user.id)
      .not("submitted_at", "is", null)
      .maybeSingle(),
    supabase.from("profiles").select("is_admin, is_viewer").eq("user_id", user.id).maybeSingle(),
  ]);
  if (entry?.submitted_at || profile?.is_admin || profile?.is_viewer) return "ok";
  return "no-entry";
}
