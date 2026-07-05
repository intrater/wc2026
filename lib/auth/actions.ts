"use server";

import { createClient } from "@/lib/supabase/server";
import { getPhase } from "@/lib/state/phase";

export interface MagicLinkState {
  ok?: boolean;
  error?: string;
  email?: string;
}

/**
 * Send a magic link. Used both to create an entry (with a display name) and to
 * return later to edit picks. Display name is stashed in user metadata on first sign-in.
 */
export async function sendMagicLink(
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  // Strip control + bidi-override chars and cap length, matching the DB CHECK in 0015 so
  // the user sees a clean error rather than a constraint violation.
  const displayName = String(formData.get("display_name") ?? "")
    .replace(/[\p{Cc}‪-‮⁦-⁩]/gu, "")
    .trim()
    .slice(0, 40);

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email." };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Pre-lock, sign-in is about making picks; once the tournament starts it's
  // about the leaderboard. (/pick also redirects home post-lock as a backstop
  // for stale emails.)
  const { isLocked } = await getPhase();
  const next = isLocked ? "/" : "/pick";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // display_name only matters on first sign-in; harmless on return visits
      data: displayName ? { display_name: displayName } : undefined,
      emailRedirectTo: `${siteUrl}/auth/confirm?next=${next}`,
    },
  });

  if (error) return { error: error.message, email };
  return { ok: true, email };
}
