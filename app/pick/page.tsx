import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/server";
import { TIER_LABELS, GOAL_BONUS_MIN_TIER } from "@/lib/tiers/labels";
import { TierPicker, type PickerTier } from "./TierPicker";

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

  if (locked) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-5xl">🔒</div>
        <h1 className="text-3xl text-[var(--color-pitch-dark)]">Picks are locked</h1>
        <p className="text-neutral-600">The tournament has kicked off — entries are final.</p>
        <Link href="/" className="inline-block rounded-lg bg-[var(--color-pitch)] px-5 py-3 font-bold text-white">
          See the leaderboard
        </Link>
      </div>
    );
  }

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
      <header className="text-center">
        <h1 className="text-3xl text-[var(--color-pitch-dark)]">Make your picks</h1>
        <p className="text-neutral-600">
          Pick <strong>one team from each of the 12 tiers</strong>.{" "}
          <Link href="/how-it-works" className="underline">How it works</Link>
        </p>
      </header>
      <TierPicker tiers={tiers} initialPicks={initialPicks} initialSubmitted={!!entry?.submitted_at} />
    </div>
  );
}
