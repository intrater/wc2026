import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/server";
import { getPhase } from "@/lib/state/phase";
import { BottomNavClient, type BottomNavItem } from "./BottomNavClient";

/**
 * Bottom tab bar (replaces the old top nav; same links, same gating). Tabs are
 * entrant-only — pre-lock visitors are in the signup funnel and get no nav at
 * all (the landing page is their whole world). My Team is phase-appropriate:
 * the pick editor until lock, then the live scorecard. Post-lock privacy
 * (0004) keeps every pool tab gated on a submitted entry.
 */
export async function BottomNav() {
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

  const isDev = process.env.NODE_ENV === "development";
  if (!hasEntry && !isDev) return null;

  const myTeamHref = phase.isLocked && entryId ? `/entry/${entryId}` : "/pick";
  const items: BottomNavItem[] = [
    { href: "/", label: "Home", icon: "home", active: ["/"] },
    ...(hasEntry
      ? ([
          { href: "/matches", label: "Matches", icon: "matches", active: ["/matches"] },
          { href: "/digest", label: "Digest", icon: "digest", active: ["/digest"] },
          { href: myTeamHref, label: "My Team", icon: "team", active: ["/pick", "/entry"] },
        ] satisfies BottomNavItem[])
      : []),
    ...(isDev
      ? ([{ href: "/dev-login", label: "Dev", icon: "dev", active: ["/dev-login"] }] satisfies BottomNavItem[])
      : []),
  ];

  return <BottomNavClient items={items} />;
}
