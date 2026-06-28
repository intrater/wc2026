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
  let isViewer = false;
  if (user) {
    const supabase = await createClient();
    const [{ data }, { data: profile }] = await Promise.all([
      supabase.from("entries").select("id, submitted_at").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("is_viewer").eq("user_id", user.id).maybeSingle(),
    ]);
    hasEntry = !!data?.submitted_at;
    entryId = data?.id ?? null;
    // Viewers (0007) get the read-only tabs — everything but My Team.
    isViewer = !hasEntry && !!profile?.is_viewer && phase.isLocked;
  }

  const isDev = process.env.NODE_ENV === "development";
  if (!hasEntry && !isViewer && !isDev) return null;

  // Latest digest day powers the unread dot on the Digest tab (client compares
  // against the device's last-seen day in localStorage).
  let latestDigestDay: string | null = null;
  if (hasEntry || isViewer) {
    const supabase = await createClient();
    const { data: latest } = await supabase
      .from("recaps")
      .select("business_day")
      .order("business_day", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestDigestDay = latest?.business_day ?? null;
  }

  const myTeamHref = phase.isLocked && entryId ? `/entry/${entryId}` : "/pick";
  const items: BottomNavItem[] = [
    { href: "/", label: "Home", icon: "home", active: ["/"] },
    ...(hasEntry || isViewer
      ? ([
          { href: "/matches", label: "Matches", icon: "matches", active: ["/matches"] },
          {
            href: "/digest",
            label: "Digest",
            icon: "digest",
            active: ["/digest"],
            unreadKey: latestDigestDay ?? undefined,
          },
          { href: "/math", label: "Check Math", icon: "math", active: ["/math"] },
        ] satisfies BottomNavItem[])
      : []),
    ...(hasEntry
      ? ([{ href: myTeamHref, label: "My Team", icon: "team", active: ["/pick", "/entry"] }] satisfies BottomNavItem[])
      : []),
    ...(isDev
      ? ([{ href: "/dev-login", label: "Dev", icon: "dev", active: ["/dev-login"] }] satisfies BottomNavItem[])
      : []),
  ];

  return <BottomNavClient items={items} />;
}
