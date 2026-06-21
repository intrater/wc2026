import Link from "next/link";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTeamMap } from "@/lib/views/data";
import { TIER_LABELS } from "@/lib/tiers/labels";
import { getPhase } from "@/lib/state/phase";
import type { ReactNode } from "react";
import { businessDayOf, todayBusinessDay, cardStateFor, isLive } from "@/lib/matches/day";
import { summarizeTeamMatches, type TeamMatchRow, type TeamMatchSummary } from "@/lib/matches/teamSummary";
import type { TeamInfo } from "@/lib/views/data";
import { PageTitle } from "@/components/PageTitle";
import { LocalTime } from "@/components/LocalTime";
import { BUCKET_EMOJI, BUCKET_LABEL } from "@/lib/outlook/rationale";

export const dynamic = "force-dynamic";

// Row shape loaded once for the whole entry page: the summary fields plus the extra
// goal columns cardStateFor() needs for the Today/Next banner.
type EntryMatchRow = TeamMatchRow & {
  fixture_id: number;
  ht_home_goals: number | null;
  ht_away_goals: number | null;
};

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await checkPoolAccess();
  if (access === "signin") redirect("/login");
  if (access === "no-entry") redirect("/not-entered");

  const { id } = await params;
  const supabase = await createClient();
  const teamMap = await loadTeamMap();

  const { data: entry } = await supabase
    .from("entries")
    .select("id, display_name, paid")
    .eq("id", id)
    .maybeSingle();

  if (!entry) {
    return <div className="pt-10 text-center text-muted-foreground">Entry not found.</div>;
  }

  // picks are RLS-gated: visible to owner always, to everyone after lock
  const [{ data: picks }, { data: score }, { data: lines }, { data: outlook }] = await Promise.all([
    supabase.from("picks").select("tier_no, team_id").eq("entry_id", id).order("tier_no"),
    supabase.from("scores").select("total, group_stage_total").eq("entry_id", id).maybeSingle(),
    supabase.from("score_lines").select("team_id, points, label, category").eq("entry_id", id),
    supabase.from("entry_outlook").select("bucket, clinched, win_share, rationale").eq("entry_id", id).maybeSingle(),
  ]);

  if (!picks || picks.length === 0) {
    return (
      <div className="space-y-3 pt-6 text-center">
        <PageTitle>{entry.display_name}</PageTitle>
        <div className="text-4xl">🔒</div>
        <p className="text-muted-foreground">This roster is hidden until the tournament kicks off.</p>
        <Link href="/" className="text-sm font-semibold text-neon hover:underline">Back to leaderboard</Link>
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
  // Independently re-add the per-team totals shown below, so the page can prove the
  // breakdown reconciles to the stored total (and therefore to the leaderboard).
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const grandTotal = r2(picks.reduce((s, p) => s + (ptsByTeam.get(p.team_id) ?? 0), 0));
  const reconciles = score != null && grandTotal === r2(score.total);

  // Once locked, load every fixture involving a picked team — once for the whole page,
  // shared by the Today/Next banner and the per-team record line. Pre-lock there are no
  // results worth showing, so we skip the query entirely.
  const phase = await getPhase();
  const teamIds = picks.map((p) => p.team_id);
  let matchRows: EntryMatchRow[] = [];
  if (phase.isLocked && teamIds.length > 0) {
    const { data } = await supabase
      .from("matches")
      .select(
        "fixture_id, kickoff, status, home_team_id, away_team_id, home_goals, away_goals, live_home_goals, live_away_goals, ht_home_goals, ht_away_goals, live_elapsed, winner_team_id, decided_by",
      )
      .or(`home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`)
      .order("kickoff", { ascending: true });
    matchRows = data ?? [];
  }
  const summaryByTeam = new Map<number, TeamMatchSummary>(
    teamIds.map((id) => [id, summarizeTeamMatches(id, matchRows)]),
  );
  const today = todayBusinessDay();

  return (
    <div className="space-y-5">
      <div className="text-center">
        <PageTitle sub={<>Every pick and every point, team by team.</>}>
          {entry.display_name}
        </PageTitle>
        {score && (
          <p className="mt-2 text-muted-foreground">
            <span className="text-3xl font-extrabold tabular-nums text-neon text-glow">{score.total}</span> pts
          </p>
        )}
        {outlook && (
          <div className="mx-auto mt-3 max-w-sm rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
            <p className="font-bold">
              {outlook.clinched ? "🔒" : BUCKET_EMOJI[outlook.bucket as string] ?? ""}{" "}
              <span className={outlook.clinched || outlook.bucket === "front_runner" ? "text-neon" : ""}>
                {outlook.clinched ? "Clinched" : BUCKET_LABEL[outlook.bucket as string] ?? ""}
              </span>{" "}
              <span className="font-normal text-muted-foreground">· chance to win it all</span>
            </p>
            {outlook.rationale && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{outlook.rationale}</p>
            )}
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Rough projection from a Monte Carlo simulation ·{" "}
              <Link href="/how-its-built#chance-to-win" className="text-neon hover:underline">
                how it works
              </Link>
            </p>
          </div>
        )}
        <p className="mt-3">
          <Link href="/tiers" className="text-sm font-semibold text-neon hover:underline">
            Tier list · who picked each team →
          </Link>
        </p>
      </div>

      <TodayAndNext rows={matchRows} teamIds={teamIds} teamMap={teamMap} isLocked={phase.isLocked} />

      <div className="space-y-2">
        {picks.map((p) => {
          const team = teamMap.get(p.team_id);
          const teamLines = linesByTeam.get(p.team_id) ?? [];
          const total = ptsByTeam.get(p.team_id) ?? 0;
          return (
            <div key={p.tier_no} className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{team?.flag}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{team?.name}</span>
                  <span className="text-xs text-muted-foreground"><span className="font-mono text-neon">{String(p.tier_no).padStart(2, "0")}</span> · {TIER_LABELS[p.tier_no]}</span>
                  <TeamStatusLine summary={summaryByTeam.get(p.team_id)} teamMap={teamMap} today={today} />
                </span>
                <span className="text-lg font-extrabold tabular-nums text-neon">{total}</span>
              </div>
              {teamLines.length > 0 ? (
                <div className="mt-1 border-t border-border pt-1 text-xs leading-relaxed text-muted-foreground">
                  {teamLines.map((l, i) => (
                    <span key={i}>
                      {i > 0 && <span className="text-border"> + </span>}
                      <span className="font-semibold tabular-nums text-foreground">+{l.points}</span>{" "}
                      {cleanLabel(l.label)}
                    </span>
                  ))}
                  {teamLines.length > 1 && (
                    <span> = <span className="font-semibold tabular-nums text-foreground">{total}</span></span>
                  )}
                </div>
              ) : (
                <div className="mt-1 border-t border-border pt-1 text-xs text-muted-foreground">
                  No points yet
                </div>
              )}
            </div>
          );
        })}
      </div>

      {score != null && (
        <div className="rounded-xl border border-border bg-card p-3 text-center text-sm shadow-sm">
          <p>
            <span className="text-muted-foreground">All 12 teams add up to </span>
            <span className="text-lg font-extrabold tabular-nums text-neon">{grandTotal}</span>
            <span className="text-muted-foreground"> pts</span>
            {reconciles ? (
              <span className="text-muted-foreground">
                {" "}— your exact total on the{" "}
                <Link href="/" className="font-semibold text-neon hover:underline">leaderboard</Link>.
              </span>
            ) : (
              <span className="text-destructive"> — recalculating…</span>
            )}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Every point above is produced by the same scoring engine that ranks the pool — a pure
            recompute from the actual results, nothing entered by hand.{" "}
            <Link href="/how-its-built" className="text-neon hover:underline">how it&apos;s built</Link>
          </p>
        </div>
      )}
    </div>
  );
}

/** Drop the trailing "(+N)" some engine labels carry (e.g. "Upset draw (+2.5)"),
 *  since the point value is already shown as the "+N" prefix in the breakdown. */
function cleanLabel(label: string): string {
  return label.replace(/\s*\(\+?[\d.]+\)\s*$/, "");
}

const NEXT_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
});

/**
 * One line under each picked team: the actual scoreline of every match it has played
 * ("Beat 🇯🇵 Japan 1–0"), a live score while it's on the pitch, and a "today / next"
 * nudge otherwise. This is the only surface that shows a team which played and *lost*
 * (the points breakdown lists point-earning events only). Renders nothing pre-lock /
 * before a team has a fixture.
 */
const RESULT_VERB = { W: "Beat", D: "Drew", L: "Lost to" } as const;

function opponentLabel(oppId: number | null, teamMap: Map<number, TeamInfo>): string {
  const opp = oppId != null ? teamMap.get(oppId) : undefined;
  return opp ? `${opp.flag} ${opp.name}` : "opponent";
}

function TeamStatusLine({
  summary,
  teamMap,
  today,
}: {
  summary: TeamMatchSummary | undefined;
  teamMap: Map<number, TeamInfo>;
  today: string;
}) {
  if (!summary) return null;
  const { results, played, live, nextKickoff } = summary;

  const resultText = results
    .map(
      (r) =>
        `${RESULT_VERB[r.outcome]} ${opponentLabel(r.oppId, teamMap)} ${r.my}–${r.opp}${r.pens ? " (pens)" : ""}`,
    )
    .join(" · ");

  let ahead: ReactNode = null;
  if (nextKickoff) {
    ahead =
      businessDayOf(nextKickoff) === today
        ? <>Plays today <LocalTime iso={nextKickoff} /></>
        : `Next ${NEXT_DAY.format(new Date(nextKickoff))}`;
  } else if (played === 0 && !live) {
    ahead = "Yet to play";
  }

  if (!resultText && !ahead && !live) return null;

  return (
    <span className="mt-0.5 block text-xs text-muted-foreground">
      {resultText}
      {live && (
        <>
          {resultText && " · "}
          <span className="font-semibold text-neon">
            ● Live vs {opponentLabel(live.oppId, teamMap)} {live.my}–{live.opp}
            {live.elapsed != null ? ` ${live.elapsed}′` : ""}
          </span>
        </>
      )}
      {ahead && !live && <>{resultText && " · "}{ahead}</>}
    </span>
  );
}

/**
 * Which of this entry's teams play today, and the next upcoming fixture (U6) —
 * the "know who to root against" line. Hidden pre-lock (the tournament hasn't
 * started; an owner viewing their own roster pre-lock shouldn't see a stub).
 * Fixtures are loaded once by the page and shared with the per-team record lines.
 */
function TodayAndNext({
  rows,
  teamIds,
  teamMap,
  isLocked,
}: {
  rows: EntryMatchRow[];
  teamIds: number[];
  teamMap: Map<number, TeamInfo>;
  isLocked: boolean;
}) {
  if (!isLocked || teamIds.length === 0) return null;

  const today = todayBusinessDay();
  const mine = new Set(teamIds);

  const todays = rows.filter((m) => m.kickoff && businessDayOf(m.kickoff) === today);
  const next = rows.find(
    (m) =>
      m.kickoff &&
      businessDayOf(m.kickoff) > today &&
      m.home_team_id != null &&
      m.away_team_id != null,
  );
  if (todays.length === 0 && !next) return null;

  const describe = (m: (typeof rows)[number]): ReactNode => {
    const ours = [m.home_team_id, m.away_team_id].filter((id): id is number => id != null && mine.has(id));
    const opp = [m.home_team_id, m.away_team_id].find((id) => id != null && !mine.has(id!));
    const ourTeams = ours.map((id) => teamMap.get(id)).filter(Boolean) as TeamInfo[];
    const oppTeam = opp != null ? teamMap.get(opp) : undefined;
    const state = cardStateFor(m);
    const score: ReactNode =
      state.kind === "final"
        ? `${state.home}–${state.away} FT`
        : state.kind === "live"
          ? `LIVE${state.elapsed != null ? ` ${state.elapsed}′` : ""} ${state.home}–${state.away}`
          : state.kind === "halftime"
            ? `HT ${state.home}–${state.away}`
            : m.kickoff
              ? <LocalTime iso={m.kickoff} />
              : "TBD";
    const us = ourTeams.map((t) => `${t.flag} ${t.name}`).join(" & ");
    return ours.length === 2 ? (
      <>{us} — {score}</>
    ) : (
      <>{us} {oppTeam ? `vs ${oppTeam.flag} ${oppTeam.name}` : ""} · {score}</>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
      {todays.length > 0 && (
        <div>
          <span className={`font-bold ${todays.some((m) => isLive(m.status)) ? "text-neon" : "text-muted-foreground"}`}>
            Today:
          </span>{" "}
          {todays.map((m, i) => (
            <span key={m.fixture_id}>
              {i > 0 && "  ·  "}
              {describe(m)}
            </span>
          ))}
        </div>
      )}
      {next?.kickoff && (
        <div className={todays.length > 0 ? "mt-1" : ""}>
          <span className="font-bold text-muted-foreground">Next:</span> {describe(next)}{" "}
          <span className="text-muted-foreground">({NEXT_DAY.format(new Date(next.kickoff))})</span>
        </div>
      )}
    </div>
  );
}
