// Unsubscribe-link signatures for the morning digest email. The HMAC is the
// authorization: anyone holding a valid (uid, sig) pair may set that ONE user's
// digest_opt_in to false — nothing more. Keyed by DIGEST_LINK_SECRET (independent
// of CRON_SECRET so the two rotate separately).
import { createHmac, timingSafeEqual } from "node:crypto";

/** Hex HMAC-SHA256 of the user id. */
export function digestSig(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("hex");
}

/** Constant-time verify; returns false (never throws) on malformed input. */
export function verifyDigestSig(userId: string, sig: string, secret: string): boolean {
  if (!userId || !sig || !secret) return false;
  const expected = Buffer.from(digestSig(userId, secret), "hex");
  let provided: Buffer;
  try {
    provided = Buffer.from(sig, "hex");
  } catch {
    return false;
  }
  // timingSafeEqual throws on length mismatch — check first.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** One-click unsubscribe URL for the email footer (lands on a confirm page). */
export function unsubscribeUrl(siteUrl: string, userId: string, secret: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/unsubscribe?uid=${encodeURIComponent(userId)}&sig=${digestSig(userId, secret)}`;
}
