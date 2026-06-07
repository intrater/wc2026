import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/server";
import { getPhase } from "@/lib/state/phase";

/**
 * Top nav. Pre-lock, "Matches"/"My Picks" appear only for entrants (the landing-page
 * CTA is the way in for newcomers). Once the tournament locks, Matches and Recap are
 * visible to EVERYONE — the app is fully public in tracking mode (U8); only My Picks
 * stays entry-gated.
 */
export async function NavBar() {
  const [user, phase] = await Promise.all([getUser(), getPhase()]);
  let hasEntry = false;
  let entryId: string | null = null;
  if (user) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("entries")
      .select("id, submitted_at")
      .eq("user_id", user.id)
      .maybeSingle();
    hasEntry = !!data?.submitted_at;
    entryId = data?.id ?? null;
  }

  // Post-lock privacy (0004): the pool is entrants-only once live, so every pool
  // link is gated on having a submitted entry — in any phase.
  const showMatches = hasEntry;
  // One concept, phase-appropriate surface: the pick editor until lock, then the
  // live scorecard (entry page) for the rest of the tournament.
  const myTeamHref = phase.isLocked && entryId ? `/entry/${entryId}` : "/pick";

  return (
    <nav className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-center gap-5 px-4 py-3 text-sm font-semibold">
        <Link href="/" className="flex items-center gap-1.5 tracking-tight">
          <span className="text-base">🇺🇸</span>
          <span className="text-foreground">
            WC<span className="text-neon">26</span>
          </span>
        </Link>
        {showMatches && (
          <Link href="/matches" className="text-muted-foreground transition-colors hover:text-foreground">Matches</Link>
        )}
        {phase.isLocked && hasEntry && (
          <Link href="/recap" className="text-muted-foreground transition-colors hover:text-foreground">Recap</Link>
        )}
        {hasEntry && (
          <Link href={myTeamHref} className="text-muted-foreground transition-colors hover:text-foreground">My Team</Link>
        )}
        <Link href="/how-it-works" className="ml-auto text-muted-foreground transition-colors hover:text-foreground">Rules</Link>
        {process.env.NODE_ENV === "development" && (
          <Link href="/dev-login" className="rounded-md bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300 ring-1 ring-amber-400/30">🔧 Dev</Link>
        )}
      </div>
    </nav>
  );
}
