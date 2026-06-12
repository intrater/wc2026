import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
import { getFixtureEvents, getFixtureStats, type ApiEvent } from "@/lib/api-football/details";
import {
  STAGE_LABEL,
  cardStateFor,
  formatBusinessDayLabel,
  formatKickoffTimeET,
  businessDayOf,
  isLive,
  isTerminal,
} from "@/lib/matches/day";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Match · World Cup 2026 Pool" };

/** Stat rows worth showing, in display order: [api type, label]. */
const STAT_ROWS: Array<[string, string]> = [
  ["Ball Possession", "Possession"],
  ["expected_goals", "xG"],
  ["Total Shots", "Shots"],
  ["Shots on Goal", "On target"],
  ["Corner Kicks", "Corners"],
  ["Fouls", "Fouls"],
  ["Yellow Cards", "Yellow cards"],
  ["Red Cards", "Red cards"],
  ["Goalkeeper Saves", "Saves"],
];

function eventIcon(e: ApiEvent): string {
  if (e.type === "Goal") {
    if (e.detail === "Missed Penalty") return "❌";
    return "⚽";
  }
  if (e.type === "Card") return e.detail === "Red Card" ? "🟥" : "🟨";
  if (e.type === "subst") return "🔁";
  if (e.type === "Var") return "📺";
  return "·";
}

function eventLabel(e: ApiEvent): string {
  const player = e.player.name ?? "—";
  if (e.type === "Goal") {
    const extra =
      e.detail === "Own Goal"
        ? " (og)"
        : e.detail === "Penalty"
          ? " (pen)"
          : e.detail === "Missed Penalty"
            ? " (pen missed)"
            : "";
    const assist = e.assist.name ? ` · assist ${e.assist.name}` : "";
    return `${player}${extra}${assist}`;
  }
  if (e.type === "subst") {
    // API quirk: player = on, assist = off
    return e.assist.name ? `${e.player.name ?? "?"} on, ${e.assist.name} off` : player;
  }
  if (e.type === "Var") return `VAR: ${e.detail}${e.player.name ? ` (${e.player.name})` : ""}`;
  return e.comments ? `${player} (${e.comments.toLowerCase()})` : player;
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const access = await checkPoolAccess();
  if (access === "signin") redirect("/login");
  if (access === "no-entry") redirect("/not-entered");

  const { fixtureId: raw } = await params;
  const fixtureId = Number(raw);
  if (!Number.isFinite(fixtureId)) notFound();

  const supabase = await createClient();
  const { data: match } = await supabase
    .from("matches")
    .select(
      "fixture_id, stage, group_label, kickoff, status, home_goals, away_goals, home_team_id, away_team_id, live_home_goals, live_away_goals, ht_home_goals, ht_away_goals, live_elapsed, decided_by, updated_at",
    )
    .eq("fixture_id", fixtureId)
    .maybeSingle();
  if (!match) notFound();

  const { data: teams } = await supabase.from("teams").select("id, api_id, name, flag");
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const teamByApiId = new Map((teams ?? []).filter((t) => t.api_id).map((t) => [t.api_id as number, t]));
  const home = match.home_team_id ? teamById.get(match.home_team_id) : undefined;
  const away = match.away_team_id ? teamById.get(match.away_team_id) : undefined;

  const state = cardStateFor(match);
  const live = isLive(match.status);
  const terminal = isTerminal(match.status);
  const showDetail = live || terminal || state.kind === "paused";

  // Detail data (60s-cached upstream) + pool stakes, fetched together.
  const teamIds = [match.home_team_id, match.away_team_id].filter((id): id is number => id != null);
  const [events, stats, { data: pickRows }, { data: lineRows }] = await Promise.all([
    showDetail ? getFixtureEvents(fixtureId) : Promise.resolve([]),
    showDetail ? getFixtureStats(fixtureId) : Promise.resolve([]),
    teamIds.length
      ? supabase.from("picks").select("team_id, entries!inner(display_name, submitted_at)").in("team_id", teamIds)
      : Promise.resolve({ data: [] as never[] }),
    terminal
      ? supabase.from("score_lines").select("team_id, points, label, entry_id").eq("match_id", fixtureId)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const holders = (teamId: number | null) =>
    teamId == null
      ? []
      : ((pickRows ?? []) as unknown as Array<{ team_id: number; entries: { display_name: string; submitted_at: string | null } }>)
          .filter((p) => p.team_id === teamId && p.entries?.submitted_at)
          .map((p) => p.entries.display_name)
          .sort();

  // Per-team scoring lines from THIS match (identical for every holder — show once).
  const linesFor = (teamId: number | null) => {
    if (teamId == null) return [];
    const seen = new Map<string, number>();
    for (const l of (lineRows ?? []) as Array<{ team_id: number; points: number; label: string }>) {
      if (l.team_id === teamId) seen.set(l.label, Number(l.points));
    }
    return [...seen.entries()].map(([label, points]) => ({ label, points }));
  };

  const sortedEvents = [...events].sort(
    (a, b) => a.time.elapsed + (a.time.extra ?? 0) / 100 - (b.time.elapsed + (b.time.extra ?? 0) / 100),
  );

  const statRows = STAT_ROWS.map(([type, label]) => {
    const val = (apiTeamId: number | undefined) => {
      if (apiTeamId == null) return null;
      const block = stats.find((s) => s.team.id === apiTeamId);
      const row = block?.statistics.find((r) => r.type === type);
      return row?.value ?? null;
    };
    return { label, home: val(home?.api_id ?? undefined), away: val(away?.api_id ?? undefined) };
  }).filter((r) => r.home != null || r.away != null);

  const chip =
    match.stage === "group"
      ? match.group_label
        ? `Group ${match.group_label}`
        : "Group Stage"
      : match.stage
        ? STAGE_LABEL[match.stage as keyof typeof STAGE_LABEL]
        : "";

  const score =
    state.kind === "final"
      ? { home: state.home, away: state.away }
      : state.kind === "live" || state.kind === "halftime"
        ? { home: state.home, away: state.away }
        : state.kind === "paused"
          ? { home: state.home ?? 0, away: state.away ?? 0 }
          : null;

  const statusLine =
    state.kind === "final"
      ? `Final${state.decidedBy === "extra_time" ? " · AET" : state.decidedBy === "penalties" ? " · Pens" : ""}`
      : state.kind === "halftime"
        ? "Halftime"
        : state.kind === "live"
          ? `Live${state.elapsed != null ? ` · ${state.elapsed}′` : ""}`
          : state.kind === "paused"
            ? "Paused"
            : state.kind === "tbd"
              ? "Teams TBD"
              : match.kickoff
                ? `Kicks off ${formatKickoffTimeET(match.kickoff)} ET`
                : "Scheduled";

  return (
    <div className="space-y-4">
      {live && <AutoRefresh />}
      <Link href="/matches" className="text-sm font-semibold text-neon hover:underline">
        ← All matches
      </Link>

      {/* header */}
      <div className="rounded-2xl border border-border bg-card p-5 text-center shadow-xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {chip}
          {match.kickoff && ` · ${formatBusinessDayLabel(businessDayOf(match.kickoff))}`}
        </p>
        <div className="mt-3 flex items-center justify-center gap-4">
          <TeamCol flag={home?.flag} name={home?.name} />
          <div className="shrink-0">
            {score ? (
              <span className={`text-4xl font-extrabold tabular-nums ${live ? "text-neon" : ""}`}>
                {score.home}–{score.away}
              </span>
            ) : (
              <span className="text-lg font-bold uppercase text-muted-foreground">vs</span>
            )}
            {(state.kind === "live" || state.kind === "paused") && match.ht_home_goals != null && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                HT {match.ht_home_goals}–{match.ht_away_goals}
              </p>
            )}
          </div>
          <TeamCol flag={away?.flag} name={away?.name} />
        </div>
        <p className={`mt-3 text-sm font-bold ${live ? "text-neon" : "text-muted-foreground"}`}>
          {live && "● "}
          {statusLine}
        </p>
      </div>

      {/* events */}
      {showDetail && sortedEvents.length > 0 && (
        <Card title="The Action">
          <ul>
            {sortedEvents.map((e, i) => {
              const t = teamByApiId.get(e.team.id);
              const isSub = e.type === "subst";
              return (
                <li
                  key={i}
                  className={`flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 ${isSub ? "opacity-55" : ""}`}
                >
                  <span className="w-10 shrink-0 text-right font-mono text-sm font-bold tabular-nums text-muted-foreground">
                    {e.time.elapsed}
                    {e.time.extra ? `+${e.time.extra}` : ""}′
                  </span>
                  <span className="shrink-0 text-base">{eventIcon(e)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="mr-1.5">{t?.flag}</span>
                    {eventLabel(e)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* stats */}
      {showDetail && statRows.length > 0 && (
        <Card title="The Numbers">
          <ul className="px-4 py-2">
            {statRows.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-0">
                <span className="w-16 text-left font-bold tabular-nums">{r.home ?? "—"}</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{r.label}</span>
                <span className="w-16 text-right font-bold tabular-nums">{r.away ?? "—"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* pool stakes */}
      <Card title="Pool Stakes">
        <div className="space-y-4 px-4 py-3">
          {[
            { team: home, id: match.home_team_id },
            { team: away, id: match.away_team_id },
          ].map(({ team, id }) =>
            team ? (
              <div key={team.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-bold">
                    {team.flag} {team.name}
                  </p>
                  {terminal && linesFor(id).length > 0 && (
                    <p className="shrink-0 text-sm font-extrabold tabular-nums text-neon">
                      +{linesFor(id).reduce((s, l) => s + l.points, 0)} each
                    </p>
                  )}
                </div>
                {terminal && linesFor(id).length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {linesFor(id).map((l) => `${l.label} +${l.points}`).join(" · ")}
                  </p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                  {holders(id).length > 0 ? (
                    <>
                      <span className="font-semibold text-foreground">{holders(id).length}</span> holding:{" "}
                      {holders(id).join(", ")}
                    </>
                  ) : (
                    "Nobody in the pool holds them."
                  )}
                </p>
              </div>
            ) : null,
          )}
          {live && (
            <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
              Live scores are display-only — points land when the result is final.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function TeamCol({ flag, name }: { flag?: string; name?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <span className="text-4xl">{flag ?? "🏳️"}</span>
      <span className="truncate text-sm font-bold">{name ?? "TBD"}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}
