"use server";

import { getUser } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Toggle the morning digest email subscription for the signed-in user.
 * profiles have no client write policies (0002) — the write goes through the
 * service role after the auth assertion, same as the other profile mutations.
 */
export async function setDigestOptIn(optIn: boolean): Promise<{ ok?: true; error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ digest_opt_in: optIn })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  return { ok: true };
}
