"use server";

import { redirect } from "next/navigation";
import { verifyDigestSig } from "@/lib/digest/token";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Confirm-button handler for the email unsubscribe link. The HMAC signature IS
 * the authorization (no login): it only grants setting this one user's
 * digest_opt_in to false. POST-only so mail-scanner link prefetches can't
 * trigger it.
 */
export async function confirmUnsubscribe(formData: FormData) {
  const uid = String(formData.get("uid") ?? "");
  const sig = String(formData.get("sig") ?? "");
  const secret = process.env.DIGEST_LINK_SECRET;

  if (!secret || !verifyDigestSig(uid, sig, secret)) {
    redirect("/unsubscribe"); // renders the invalid-link state
  }

  const admin = createAdminClient();
  await admin.from("profiles").update({ digest_opt_in: false }).eq("user_id", uid);

  redirect("/unsubscribe?done=1");
}
