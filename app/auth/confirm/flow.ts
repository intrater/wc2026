// Pure helpers for the magic-link callback, split out so they're unit-testable
// without pulling in next/headers or the Supabase server client.

export type AuthMethod = "exchange" | "verify" | "none";

/**
 * Decide how to complete sign-in from the callback query params.
 *  - PKCE `code` (default `{{ .ConfirmationURL }}` email) → exchangeCodeForSession
 *  - `token_hash` + `type` → verifyOtp
 *  - neither → error
 * `code` takes precedence: it's the flow our Supabase email template actually uses.
 */
export function authMethodFor(p: {
  code: string | null;
  token_hash: string | null;
  type: string | null;
}): AuthMethod {
  if (p.code) return "exchange";
  if (p.token_hash && p.type) return "verify";
  return "none";
}

/** Only allow same-origin relative redirects (no open redirect via ?next=https://evil). */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/pick";
  return next;
}
