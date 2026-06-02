import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/server";
import { loadTeamMap, type TeamInfo } from "@/lib/views/data";
import type { MatchStage } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const STAGE_ORDER: MatchStage[] = ["group", "r32", "r16", "qf", "sf", "third_place", "final"];
const STAGE_LABEL: Record<MatchStage, string> = {
  group: "Group Stage", r32: "Round of 32", r16: "Round of 16", qf: "Quarterfinals",
  sf: "Semifinals", third_place: "Third-place playoff", final: "Final",
};
const TERMINAL = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

export default async function MatchesPage() {
  const supabase = await createClient();
  const teamMap = await loadTeamMap();
  const user = await getUser();

  // viewer's picked team ids (so we can flag their stake)
  const myTeamIds = new Set<number>();
  if (user) {
    const { data: entry } = await supabase.from("entries").select("id").eq("user_id", user.id).maybeSingle();
    if (entry) {
      const { data: picks } = await supabase.from("picks").select("team_id").eq("entry_id", entry.id);
      for (const p of picks ?? []) myTeamIds.add(p.team_id);
    }
  }

  const { data: matches } = await supabase
    .from("matches")
    .select("fixture_id, stage, group_label, kickoff, status, home_goals, away_goals, home_team_id, away_team_id")
    .order("kickoff", { ascending: true });

  const rows = matches ?? [];
  if (rows.length === 0) {
    return (
      <div className="text-center text-neutral-500">
        <h1 className="mb-2 text-2xl font-bold text-[var(--color-pitch-dark)]">Matches</h1>
        The schedule appears once results start syncing. ⚽️
      </div>
    );
  }

  const byStage = new Map<string, typeof rows>();
  for (const m of rows) {
    const key = m.stage ?? "group";
    if (!byStage.has(key)) byStage.set(key, []);
    byStage.get(key)!.push(m);
  }

  // Matches involving one of the viewer's teams (already sorted by kickoff).
  const myMatches = rows.filter(
    (m) =>
      (m.home_team_id != null && myTeamIds.has(m.home_team_id)) ||
      (m.away_team_id != null && myTeamIds.has(m.away_team_id)),
  );

  const renderRow = (m: (typeof rows)[number]) => (
    <MatchRow
      key={m.fixture_id}
      home={m.home_team_id ? teamMap.get(m.home_team_id) : undefined}
      away={m.away_team_id ? teamMap.get(m.away_team_id) : undefined}
      homeGoals={m.home_goals}
      awayGoals={m.away_goals}
      played={TERMINAL.has(m.status)}
      group={m.group_label}
      myTeamIds={myTeamIds}
      signedIn={!!user}
    />
  );

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pitch-dark)]">Matches</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every match in the tournament. Scores update automatically after each game ends.
        </p>
      </header>
      {!user && (
        <p className="text-center text-sm text-neutral-500">
          <Link href="/login" className="underline">Sign in</Link> to see which of your teams are playing.
        </p>
      )}

      {myMatches.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold text-[var(--color-pitch-dark)]">⭐ Your matches</h2>
          <div className="space-y-2">{myMatches.map(renderRow)}</div>
        </section>
      )}

      {myMatches.length > 0 && (
        <h2 className="border-t border-neutral-200 pt-4 text-center text-sm font-semibold text-neutral-400">
          All matches
        </h2>
      )}

      {STAGE_ORDER.filter((s) => byStage.has(s)).map((stage) => (
        <section key={stage}>
          <h2 className="mb-2 font-bold text-neutral-700">{STAGE_LABEL[stage]}</h2>
          <div className="space-y-2">{byStage.get(stage)!.map(renderRow)}</div>
        </section>
      ))}
    </div>
  );
}

function MatchRow({
  home, away, homeGoals, awayGoals, played, group, myTeamIds, signedIn,
}: {
  home?: TeamInfo; away?: TeamInfo; homeGoals: number | null; awayGoals: number | null;
  played: boolean; group: string | null; myTeamIds: Set<number>; signedIn: boolean;
}) {
  const mine = [home, away].filter((t): t is TeamInfo => !!t && myTeamIds.has(t.id));
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <TeamSide team={home} mine={!!home && myTeamIds.has(home.id)} />
        <div className="px-2 text-center">
          {played ? (
            <span className="text-lg font-extrabold">{homeGoals}–{awayGoals}</span>
          ) : (
            <span className="text-xs text-neutral-400">{group ? `Grp ${group}` : "vs"}</span>
          )}
        </div>
        <TeamSide team={away} mine={!!away && myTeamIds.has(away.id)} alignRight />
      </div>
      {signedIn && mine.length > 0 && (
        <div className="mt-2 border-t pt-2 text-xs">
          {mine.length === 2 ? (
            <span className="font-semibold text-[var(--color-pitch-dark)]">⚡ Both your teams!</span>
          ) : (
            <span className="font-semibold text-[var(--color-pitch-dark)]">
              You have {mine[0].flag} {mine[0].name}
            </span>
          )}
          {mine.some((t) => t.goalBonus) && (
            <span className="ml-2 text-[var(--color-flame)]">⚽ goals score you points</span>
          )}
        </div>
      )}
    </div>
  );
}

function TeamSide({ team, mine, alignRight }: { team?: TeamInfo; mine: boolean; alignRight?: boolean }) {
  return (
    <div className={`flex flex-1 items-center gap-2 ${alignRight ? "flex-row-reverse text-right" : ""}`}>
      <span className="text-2xl">{team?.flag ?? "🏳️"}</span>
      <span className={`font-semibold ${mine ? "text-[var(--color-pitch-dark)]" : ""}`}>
        {team?.name ?? "TBD"}
        {mine && " ⭐"}
      </span>
    </div>
  );
}
