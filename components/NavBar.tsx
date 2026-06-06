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
    <nav className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-center gap-5 px-4 py-3 text-sm font-semibold">
        <Link href="/" className="flex items-center gap-1.5 tracking-tight">
          <span className="text-base">🇺🇸</span>
          <span className="text-foreground">
            WC<span className="text-neon">26</span>
          </span>
        </Link>
        {hasEntry && (
          <>
            <Link href="/matches" className="text-muted-foreground transition-colors hover:text-foreground">Matches</Link>
            <Link href="/pick" className="text-muted-foreground transition-colors hover:text-foreground">My Picks</Link>
          </>
        )}
        <Link href="/how-it-works" className="ml-auto text-muted-foreground transition-colors hover:text-foreground">Scoring</Link>
        {process.env.NODE_ENV === "development" && (
          <Link href="/dev-login" className="rounded-md bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300 ring-1 ring-amber-400/30">🔧 Dev</Link>
        )}
      </div>
    </nav>
  );
}
