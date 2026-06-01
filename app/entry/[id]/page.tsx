import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadTeamMap } from "@/lib/views/data";
import { TIER_LABELS } from "@/lib/tiers/labels";

export const dynamic = "force-dynamic";

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const teamMap = await loadTeamMap();

  const { data: entry } = await supabase
    .from("entries")
    .select("id, display_name, paid")
    .eq("id", id)
    .maybeSingle();

  if (!entry) {
    return <div className="text-center text-neutral-500">Entry not found.</div>;
  }

  // picks are RLS-gated: visible to owner always, to everyone after lock
  const [{ data: picks }, { data: score }, { data: lines }] = await Promise.all([
    supabase.from("picks").select("tier_no, team_id").eq("entry_id", id).order("tier_no"),
    supabase.from("scores").select("total, group_stage_total").eq("entry_id", id).maybeSingle(),
    supabase.from("score_lines").select("team_id, points, label, category").eq("entry_id", id),
  ]);

  if (!picks || picks.length === 0) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pitch-dark)]">{entry.display_name}</h1>
        <div className="text-4xl">🔒</div>
        <p className="text-neutral-600">This roster is hidden until the tournament kicks off.</p>
        <Link href="/" className="text-sm text-[var(--color-pitch)] underline">Back to leaderboard</Link>
      </div>
    );
  }

  // group lines by team
  const linesByTeam = new Map<number, { points: number; label: string }[]>();
  const ptsByTeam = new Map<number, number>();
  for (const l of lines ?? []) {
    if (!linesByTeam.has(l.team_id)) linesByTeam.set(l.team_id, []);
    linesByTeam.get(l.team_id)!.push({ points: l.points, label: l.label });
    ptsByTeam.set(l.team_id, (ptsByTeam.get(l.team_id) ?? 0) + l.points);
  }

  return (
    <div className="space-y-5">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pitch-dark)]">{entry.display_name}</h1>
        {score && (
          <p className="text-neutral-600">
            <span className="text-3xl font-extrabold text-[var(--color-pitch)]">{score.total}</span> pts
            <span className="ml-2 text-sm text-neutral-400">({score.group_stage_total} in group play)</span>
          </p>
        )}
        {!entry.paid && <p className="text-xs text-[var(--color-flame)]">unpaid</p>}
      </header>

      <div className="space-y-2">
        {picks.map((p) => {
          const team = teamMap.get(p.team_id);
          const teamLines = linesByTeam.get(p.team_id) ?? [];
          const total = ptsByTeam.get(p.team_id) ?? 0;
          return (
            <div key={p.tier_no} className="rounded-xl bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{team?.flag}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{team?.name}</span>
                  <span className="text-xs text-neutral-400">Tier {p.tier_no} · {TIER_LABELS[p.tier_no]}</span>
                </span>
                <span className="text-lg font-extrabold text-[var(--color-pitch-dark)]">{total}</span>
              </div>
              {teamLines.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 border-t pt-1 text-xs text-neutral-500">
                  {teamLines.map((l, i) => (
                    <span key={i}>+{l.points} {l.label}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
