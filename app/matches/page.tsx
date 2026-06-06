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
      <div className="pt-10 text-center text-muted-foreground">
        <h1 className="mb-2 text-3xl font-extrabold text-foreground">Matches</h1>
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
      <header className="pt-2 text-center">
        <h1 className="text-3xl font-extrabold">Matches</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every match in the tournament. Scores update automatically after each game ends.
        </p>
      </header>
      {!user && (
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-semibold text-neon hover:underline">Sign in</Link> to see which of your teams are playing.
        </p>
      )}

      {myMatches.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold text-neon">⭐ Your matches</h2>
          <div className="space-y-2">{myMatches.map(renderRow)}</div>
        </section>
      )}

      {myMatches.length > 0 && (
        <h2 className="border-t border-border pt-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          All matches
        </h2>
      )}

      {STAGE_ORDER.filter((s) => byStage.has(s)).map((stage) => (
        <section key={stage}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{STAGE_LABEL[stage]}</h2>
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
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <TeamSide team={home} mine={!!home && myTeamIds.has(home.id)} />
        <div className="px-2 text-center">
          {played ? (
            <span className="text-lg font-extrabold tabular-nums">{homeGoals}–{awayGoals}</span>
          ) : (
            <span className="text-xs text-muted-foreground">{group ? `Grp ${group}` : "vs"}</span>
          )}
        </div>
        <TeamSide team={away} mine={!!away && myTeamIds.has(away.id)} alignRight />
      </div>
      {signedIn && mine.length > 0 && (
        <div className="mt-2 border-t border-border pt-2 text-xs">
          {mine.length === 2 ? (
            <span className="font-semibold text-neon">⚡ Both your teams!</span>
          ) : (
            <span className="font-semibold text-neon">
              You have {mine[0].flag} {mine[0].name}
            </span>
          )}
          {mine.some((t) => t.goalBonus) && (
            <span className="ml-2 text-neon/80">⚽ goals score you points</span>
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
      <span className={`font-semibold ${mine ? "text-neon" : ""}`}>
        {team?.name ?? "TBD"}
        {mine && " ⭐"}
      </span>
    </div>
  );
}
