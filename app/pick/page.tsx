import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/server";
import { TIER_LABELS, GOAL_BONUS_MIN_TIER } from "@/lib/tiers/labels";
import { TierPicker, type PickerTier } from "./TierPicker";
import { LockCountdown } from "@/components/LockCountdown";
import { PageTitle, TitleAccent } from "@/components/PageTitle";

export const dynamic = "force-dynamic";

export default async function PickPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const [{ data: settings }, { data: tierRows }, { data: entry }] = await Promise.all([
    supabase.from("settings").select("lock_at").single(),
    supabase.from("tiers").select("tier_no, odds, teams(id, name, flag)").order("tier_no"),
    supabase.from("entries").select("id, submitted_at").eq("user_id", user.id).limit(1).maybeSingle(),
  ]);

  const lockAt = settings?.lock_at ? new Date(settings.lock_at) : null;
  const locked = !!lockAt && lockAt.getTime() <= Date.now();
  const submitted = !!entry?.submitted_at;

  // Post-lock there is nothing to do here — every sign-in (including stale
  // magic-link emails that point at next=/pick) lands on the leaderboard.
  if (locked) redirect("/");

  // group tier rows into PickerTier[]
  const byTier = new Map<number, PickerTier>();
  for (const row of tierRows ?? []) {
    const team = row.teams as unknown as { id: number; name: string; flag: string };
    if (!byTier.has(row.tier_no)) {
      byTier.set(row.tier_no, {
        tierNo: row.tier_no,
        label: TIER_LABELS[row.tier_no] ?? "",
        goalBonus: row.tier_no >= GOAL_BONUS_MIN_TIER,
        teams: [],
      });
    }
    byTier.get(row.tier_no)!.teams.push({ id: team.id, name: team.name, flag: team.flag, odds: row.odds });
  }
  const tiers = [...byTier.values()].sort((a, b) => a.tierNo - b.tierNo);

  let initialPicks: Record<number, number> = {};
  if (entry) {
    const { data: picks } = await supabase.from("picks").select("tier_no, team_id").eq("entry_id", entry.id);
    initialPicks = Object.fromEntries((picks ?? []).map((p) => [p.tier_no, p.team_id]));
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <PageTitle
          sub={
            submitted ? (
              <>Your 12 picks, one from every tier.</>
            ) : (
              <>
                Pick <strong className="text-foreground">one team from each of the 12 tiers</strong>.{" "}
                <Link href="/how-it-works" className="font-semibold text-neon hover:underline">Scoring details</Link>
              </>
            )
          }
        >
          My <TitleAccent>Team</TitleAccent>
        </PageTitle>
        {lockAt && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold text-neon">
            <LockCountdown lockAt={lockAt.toISOString()} />
          </p>
        )}
      </div>
      <TierPicker
        tiers={tiers}
        initialPicks={initialPicks}
        initialSubmitted={submitted}
      />
    </div>
  );
}
