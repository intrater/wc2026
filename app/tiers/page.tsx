import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TIER_LABELS, GOAL_BONUS_MIN_TIER } from "@/lib/tiers/labels";
import { PageTitle, TitleAccent } from "@/components/PageTitle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tier list · World Cup 2026 Pool" };

interface BoardTeam {
  id: number;
  name: string;
  flag: string;
  odds: string | null;
}
interface BoardTier {
  tierNo: number;
  label: string;
  goalBonus: boolean;
  teams: BoardTeam[];
}

/**
 * Read-only view of the 12×4 draft board — the frozen tier list everyone picked one
 * team per tier from. Reference only; the picker (`/pick`) is where it was editable
 * pre-lock. Reads public tables (teams/tiers), so it needs no auth gate.
 */
export default async function TiersPage() {
  const supabase = await createClient();
  const { data: tierRows } = await supabase
    .from("tiers")
    .select("tier_no, odds, teams(id, name, flag)")
    .order("tier_no");

  const byTier = new Map<number, BoardTier>();
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

  return (
    <div className="space-y-5">
      <div className="text-center">
        <PageTitle sub={<>The 12 tiers everyone drafted from — one pick per tier. Reference only.</>}>
          The Tier <TitleAccent>List</TitleAccent>
        </PageTitle>
      </div>

      {tiers.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">The tier list isn&apos;t available yet.</p>
      ) : (
        tiers.map((tier) => (
          <section key={tier.tierNo} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                <span className="font-mono text-neon">{String(tier.tierNo).padStart(2, "0")}</span>{" "}
                <span className="font-normal text-muted-foreground">· {tier.label}</span>
              </h2>
              {tier.goalBonus && (
                <span className="rounded-full bg-neon/15 px-2 py-0.5 text-xs font-semibold text-neon">
                  ⚽ goals score points
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {tier.teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-3"
                >
                  <span className="text-2xl">{team.flag}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold leading-tight">{team.name}</span>
                    {team.odds && <span className="text-xs text-muted-foreground">{team.odds}</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <div className="pt-1 text-center">
        <Link href="/" className="text-sm font-semibold text-neon hover:underline">
          ← Back to the leaderboard
        </Link>
      </div>
    </div>
  );
}
