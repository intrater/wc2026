import { type NextRequest, NextResponse } from "next/server";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ensureAdminFlag } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * DEV-ONLY instant sign-in. Mints a session for ADMIN_EMAIL via the service key
 * (no email round-trip) so the auth-gated pages can be tested locally while
 * finalizing the UI. Hard-gated to development — returns 404 in production.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not found", { status: 404 });
  }

  const email = process.env.ADMIN_EMAIL ?? "john.intrater@gmail.com";
  const admin = createAdminClient();

  // 1) mint a magic-link token (does not send an email)
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    return NextResponse.json({ error: linkErr?.message ?? "could not generate link" }, { status: 500 });
  }

  // 2) verify it with a plain client to obtain a real session
  const plain = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: verified, error: vErr } = await plain.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (vErr || !verified.session || !verified.user) {
    return NextResponse.json({ error: vErr?.message ?? "verify failed" }, { status: 500 });
  }

  // 3) write that session into the SSR cookie store
  const supabase = await createClient();
  await supabase.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });
  await ensureAdminFlag(verified.user.id, verified.user.email);

  return NextResponse.redirect(new URL("/pick", request.url));
}
