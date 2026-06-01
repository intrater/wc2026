import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAdminFlag } from "@/lib/auth/server";
import { authMethodFor, safeNext } from "./flow";

/**
 * Magic-link callback. Handles both Supabase email-link flows:
 *  - PKCE `code` (default `{{ .ConfirmationURL }}` template → Supabase /verify → ?code=…)
 *  - `token_hash` + `type` (`{{ .TokenHash }}` template → here directly; stateless,
 *    so it survives clicks from a different browser / email in-app webview).
 * On success, promotes the admin if applicable, then redirects to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  const method = authMethodFor({ code, token_hash, type });
  const error =
    method === "exchange"
      ? (await supabase.auth.exchangeCodeForSession(code!)).error
      : method === "verify"
        ? (await supabase.auth.verifyOtp({ type: type!, token_hash: token_hash! })).error
        : new Error("missing token");

  if (!error) {
    const { data } = await supabase.auth.getUser();
    if (data.user) await ensureAdminFlag(data.user.id, data.user.email);
    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL("/auth/error", request.url));
}
