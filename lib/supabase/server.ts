import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isArchive } from "@/lib/archive";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server Supabase client for Server Components, Server Actions, and Route Handlers.
 * Reads/writes the auth cookie. Never use getSession() for authorization in server
 * code — use getClaims()/getUser(), which validate the JWT.
 */
export async function createClient() {
  // Archive builds render anonymously to static HTML, so RLS's entrant gating has
  // nothing to key on — use the service client (local render only, never deployed).
  if (isArchive) return createAdminClient();

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — cookie writes are handled by middleware.
          }
        },
      },
    },
  );
}
