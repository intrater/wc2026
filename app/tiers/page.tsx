import Link from "next/link";
import { redirect } from "next/navigation";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
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
 * The 12×4 draft board doubling as the ownership board: every team by tier, plus how
 * many entrants drafted it and who. Reads rosters (picks), so it's gated like the rest
 * of the pool views — and post-lock RLS is what makes everyone's picks readable.
 */
export default async function TiersPage() {
  const access = await checkPoolAccess();
  if (access === "signin") redirect("/login");
  if (access === "no-entry") redirect("/not-entered");

  const supabase = await createClient();
  const [{ data: tierRows }, { data: pickRows }] = await Promise.all([
    supabase.from("tiers").select("tier_no, odds, teams(id, name, flag)").order("tier_no"),
    supabase.from("picks").select("team_id, entries!inner(display_name, submitted_at)"),
  ]);

  // Who drafted each team (submitted entries only — a draft isn't in the pool).
  const ownersByTeam = new Map<number, string[]>();
  for (const p of (pickRows ?? []) as unknown as Array<{
    team_id: number;
    entries: { display_name: string; submitted_at: string | null };
  }>) {
    if (!p.entries?.submitted_at) continue;
    const list = ownersByTeam.get(p.team_id) ?? [];
    list.push(p.entries.display_name);
    ownersByTeam.set(p.team_id, list);
  }
  for (const list of ownersByTeam.values()) list.sort((a, b) => a.localeCompare(b));

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
        <PageTitle sub={<>Every team by tier — and who drafted them.</>}>
          The <TitleAccent>Tier List</TitleAccent>
        </PageTitle>
      </div>

      {tiers.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">The tier list isn&apos;t available yet.</p>
      ) : (
        tiers.map((tier) => (
          <section key={tier.tierNo} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-1 flex items-center justify-between">
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
            <div>
              {tier.teams.map((team) => {
                const owners = ownersByTeam.get(team.id) ?? [];
                return (
                  <div key={team.id} className="border-t border-border py-2.5 first:border-t-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{team.flag}</span>
                      <span className="font-semibold">{team.name}</span>
                      {team.odds && <span className="text-xs text-muted-foreground">{team.odds}</span>}
                      {owners.length > 0 && (
                        <span className="ml-auto shrink-0 rounded-full bg-neon/15 px-2 py-0.5 text-xs font-bold tabular-nums text-neon">
                          {owners.length} {owners.length === 1 ? "pick" : "picks"}
                        </span>
                      )}
                    </div>
                    {owners.length > 0 ? (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{owners.join(", ")}</p>
                    ) : (
                      <p className="mt-1 text-xs italic text-muted-foreground/70">Nobody drafted them.</p>
                    )}
                  </div>
                );
              })}
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
