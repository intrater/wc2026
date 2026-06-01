"use server";

import { createClient } from "@/lib/supabase/server";

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
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email." };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // display_name only matters on first sign-in; harmless on return visits
      data: displayName ? { display_name: displayName } : undefined,
      emailRedirectTo: `${siteUrl}/auth/confirm?next=/pick`,
    },
  });

  if (error) return { error: error.message, email };
  return { ok: true, email };
}
