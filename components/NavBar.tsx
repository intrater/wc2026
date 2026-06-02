import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/server";

/**
 * Top nav. "Matches" and "My Picks" only appear once the viewer is signed in AND
 * has submitted an entry — before that, the landing-page CTA is the way in, so the
 * nav stays uncluttered for newcomers (#2).
 */
export async function NavBar() {
  const user = await getUser();
  let hasEntry = false;
  if (user) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("entries")
      .select("submitted_at")
      .eq("user_id", user.id)
      .maybeSingle();
    hasEntry = !!data?.submitted_at;
  }

  return (
    <nav className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 text-sm font-semibold">
        <Link href="/" className="text-[var(--color-pitch-dark)]">🏆 Pool</Link>
        {hasEntry && (
          <>
            <Link href="/matches" className="text-neutral-600 hover:text-neutral-900">Matches</Link>
            <Link href="/pick" className="text-neutral-600 hover:text-neutral-900">My Picks</Link>
          </>
        )}
        <Link href="/how-it-works" className="ml-auto text-neutral-600 hover:text-neutral-900">How it works</Link>
      </div>
    </nav>
  );
}
