"use server";

import { redirect } from "next/navigation";
import { verifyDigestSig } from "@/lib/digest/token";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Confirm-button handler for the email subscribe link — mirror of
 * confirmUnsubscribe. The HMAC signature IS the authorization (no login): it
 * only grants setting this one user's digest_opt_in to true. POST-only so
 * mail-scanner link prefetches can't trigger it.
 */
export async function confirmSubscribe(formData: FormData) {
  const uid = String(formData.get("uid") ?? "");
  const sig = String(formData.get("sig") ?? "");
  const secret = process.env.DIGEST_LINK_SECRET;

  if (!secret || !verifyDigestSig(uid, sig, secret)) {
    redirect("/subscribe"); // renders the invalid-link state
  }

  const admin = createAdminClient();
  await admin.from("profiles").update({ digest_opt_in: true }).eq("user_id", uid);

  redirect("/subscribe?done=1");
}
