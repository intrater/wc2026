import Link from "next/link";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/server";
import { getPhase } from "@/lib/state/phase";
import { LockCountdown } from "@/components/LockCountdown";
import { SharePool } from "@/components/SharePool";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PageTitle, TitleAccent } from "@/components/PageTitle";
import { FlagField } from "@/components/FlagField";
import { LocalTime } from "@/components/LocalTime";
import { rankWithTies, movementFor } from "@/lib/standings/snapshot";
import { formatBusinessDayLabel, todayBusinessDay, businessDayOf, cardStateFor, isLive, isTerminal, type CardState } from "@/lib/matches/day";
import { loadTeamMap } from "@/lib/views/data";
import { hookFor } from "@/lib/digest/email";
import type { Recap, RecapStats } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const access = await checkPoolAccess();
  if (access === "signin") redirect("/login");
  if (access === "no-entry") redirect("/not-entered");

  const supabase = await createClient();
  const phase = await getPhase();
  const user = await getUser();

  const mine = user
    ? await supabase.from("entries").select("submitted_at, paid").eq("user_id", user.id).maybeSingle()
    : { data: null };

  const hasSubmitted = !!mine?.data?.submitted_at;
  const owesEntryFee = hasSubmitted && !mine?.data?.paid;
  const lockAt = phase.lockAt ? phase.lockAt.toISOString() : null;
  // Post-lock: everyone sees the board. Pre-lock: only entrants who already
  // submitted — anyone mid-funnel stays focused on the picks CTA.
  const showBoard = phase.phase !== "pre_lock" || hasSubmitted;

  return (
    // relative z-0 scopes a stacking context so the FlagField backdrop (z -10)
    // sits behind this page's content but above the body's gradient layers.
    <div className="relative z-0">
      <FlagField />
      <div className="space-y-6">
      <div className="text-center">
        <PageTitle
          sub={
            <>
              World Cup 2026 ·{" "}
              <Link
                href="/how-its-built"
                aria-label="How it's built"
                title="How it's built"
                className="inline-block transition-transform hover:scale-110 active:scale-95"
              >
                🤔
              </Link>{" "}
              ·{" "}
              <Link href="/tiers" className="font-semibold transition-colors hover:text-neon hover:underline">
                Tier list
              </Link>
            </>
          }
        >
          The <TitleAccent>Pool</TitleAccent>
        </PageTitle>
        {!phase.isLocked && lockAt && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold text-neon">
            <LockCountdown lockAt={lockAt} />
          </p>
        )}
      </div>

      {showBoard ? (
        /* Tracking mode (submitted pre-lock, or anyone post-lock): the board IS the
           page — no "How it works" noise. Editing drops to the bottom, pre-lock only. */
        <>
          {/* Standings tick over during games without a manual reload. */}
          <AutoRefresh />
          <DigestPreview supabase={supabase} />
          <TodaysMatches supabase={supabase} />
          <Leaderboard supabase={supabase} />
          {/* One action row, equal-width buttons. Pre-lock: Edit picks (primary) +
              Invite + Venmo-if-owing. Once the tournament is live, editing and
              inviting are over — only an unpaid Venmo nudge remains. */}
          {(!phase.isLocked || owesEntryFee) && (
            <div className="flex gap-2">
              {!phase.isLocked && hasSubmitted && (
                <Link
                  href="/pick"
                  className="glow-neon flex flex-1 items-center justify-center rounded-2xl bg-neon px-1 py-4 text-base font-extrabold text-neon-foreground whitespace-nowrap transition-transform active:translate-y-px"
                >
                  Edit picks
                </Link>
              )}
              {!phase.isLocked && <SharePool compact />}
              {/* Only entrants who still owe see this; gone once marked paid in admin. */}
              {owesEntryFee && (
                <a
                  href="https://venmo.com/u/john-intrater"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center rounded-2xl border border-border bg-card px-1 py-4 text-base font-bold text-foreground whitespace-nowrap transition-colors hover:border-neon/50 hover:text-neon"
                >
                  Pay via Venmo
                </a>
              )}
            </div>
          )}
        </>
      ) : (
        /* Pick mode: conversion-focused — rules + the one big CTA. */
        <>
          <Rules />
          {/* Returning entrants who got logged out need a way back in that isn't
              the signup funnel. Signed-in users see the board instead, so this
              only renders for signed-out visitors. */}
          {!user && (
            <p className="text-center text-sm text-muted-foreground">
              Already in the pool?{" "}
              <Link href="/login?mode=signin" className="font-semibold text-neon hover:underline">
                Sign in
              </Link>
            </p>
          )}
          {!phase.isLocked && (
            <Link
              href="/pick"
              className="glow-neon group flex items-center justify-center gap-2 rounded-2xl bg-neon px-6 py-4 text-center text-lg font-extrabold text-neon-foreground transition-transform active:translate-y-px"
            >
              Make your picks
              <PickArrow />
            </Link>
          )}
          <SharePool />
        </>
      )}
      </div>
    </div>
  );
}

function PickArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 transition-transform group-hover:translate-x-1"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function Rules() {
  const rows = [
    { n: "01", title: "Pick teams", desc: "One per tier (12), favorites to longshots." },
    { n: "02", title: "Score points", desc: "Wins, draws, advancing — more in knockouts." },
    { n: "03", title: "Bonus", desc: "Upsets, plus goals for tiers 7–12." },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          How it works
        </h2>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.n} className="flex items-center gap-4 border-b border-border px-5 py-4">
            <span className="font-mono text-lg font-bold text-neon">{r.n}</span>
            <div>
              <p className="font-bold">{r.title}</p>
              <p className="text-sm text-muted-foreground">{r.desc}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-sm text-muted-foreground">
          <span className="text-lg font-extrabold text-foreground">$100</span> entry
        </span>
        <a
          href="https://venmo.com/u/john-intrater"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-bold text-foreground transition-colors hover:border-neon/50 hover:text-neon"
        >
          Pay via Venmo
        </a>
      </div>
    </div>
  );
}

/**
 * Teaser for the latest digest, above the standings. Renders nothing until the
 * first digest exists; always shows the most recent day (the page is
 * force-dynamic, so it rolls over automatically when each new digest publishes).
 */
async function DigestPreview({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
  const { data } = await supabase
    .from("recaps")
    .select("business_day, stats, narrative")
    .order("business_day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const recap = data as Pick<Recap, "business_day" | "stats" | "narrative">;
  const stats = recap.stats as RecapStats;

  return (
    <Link
      href="/digest"
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-xl transition-[border-color,transform] hover:border-neon/50 active:scale-[0.98]"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Morning Digest
          <span className="ml-2 font-mono tracking-normal text-foreground">Day {stats.dayNumber}</span>
        </h2>
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs font-semibold">{formatBusinessDayLabel(recap.business_day)}</span>
          <span aria-hidden className="text-base leading-none transition-transform group-hover:translate-x-0.5 group-hover:text-neon">›</span>
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs font-bold text-neon">{hookFor(stats)}</p>
        {recap.narrative ? (
          <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-foreground/90">
            {recap.narrative}
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">
            The box score is in: results, movers, upsets, and today&apos;s slate.
          </p>
        )}
      </div>
    </Link>
  );
}

/**
 * A quick "who's playing today" glance between the digest and the leaderboard. Shows
 * each of today's (ET) matchups with a local-time kickoff or a live/final score; the
 * whole card taps through to the match center. Renders nothing on days with no matches.
 */
async function TodaysMatches({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
  const { data: matches } = await supabase
    .from("matches")
    .select(
      "fixture_id, status, kickoff, home_team_id, away_team_id, home_goals, away_goals, live_home_goals, live_away_goals, ht_home_goals, ht_away_goals, live_elapsed, decided_by",
    )
    .order("kickoff", { ascending: true });

  // "Today" is the ET business day — same definition the calendar and recaps use.
  const today = todayBusinessDay();
  const rows = (matches ?? []).filter((m) => m.kickoff && businessDayOf(m.kickoff) === today);
  if (rows.length === 0) return null;

  const teamMap = await loadTeamMap();
  const anyLive = rows.some((m) => isLive(m.status));

  return (
    <Link
      href="/matches"
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-xl transition-[border-color,transform] hover:border-neon/50 active:scale-[0.98]"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Today&apos;s Matches
          <span className="ml-2 font-mono tracking-normal text-foreground">{rows.length}</span>
        </h2>
        <span className="flex items-center gap-2">
          {anyLive ? (
            <span className="text-xs font-bold uppercase tracking-wide text-neon">● Live</span>
          ) : (
            <span className="text-xs font-semibold text-muted-foreground">{formatBusinessDayLabel(today)}</span>
          )}
          <span aria-hidden className="text-base leading-none text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-neon">›</span>
        </span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((m) => {
          const home = m.home_team_id ? teamMap.get(m.home_team_id) : undefined;
          const away = m.away_team_id ? teamMap.get(m.away_team_id) : undefined;
          const state = cardStateFor(m);
          return (
            <li key={m.fixture_id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
                <span className="truncate font-medium">{home?.name ?? "TBD"}</span>
                <span className="shrink-0 text-base">{home?.flag ?? "🏳️"}</span>
              </span>
              <span className="w-20 shrink-0 text-center">
                <MatchupCenter state={state} kickoff={m.kickoff} />
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="shrink-0 text-base">{away?.flag ?? "🏳️"}</span>
                <span className="truncate font-medium">{away?.name ?? "TBD"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Link>
  );
}

/** Center cell for a Today's-Matches row: live/final score, or the local kickoff time. */
function MatchupCenter({ state, kickoff }: { state: CardState; kickoff: string | null }) {
  switch (state.kind) {
    case "live":
    case "halftime":
      return <span className="font-extrabold tabular-nums text-neon">{state.home}–{state.away}</span>;
    case "final":
      return <span className="font-extrabold tabular-nums">{state.home}–{state.away}</span>;
    case "paused":
      return <span className="font-bold tabular-nums text-muted-foreground">{state.home ?? "–"}–{state.away ?? "–"}</span>;
    case "postponed":
    case "cancelled":
    case "abandoned":
      return <span className="text-xs text-muted-foreground">—</span>;
    default:
      return kickoff ? (
        <LocalTime iso={kickoff} />
      ) : (
        <span className="text-xs font-bold uppercase text-muted-foreground">vs</span>
      );
  }
}

async function Leaderboard({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
  const phase = await getPhase(); // cached per-request
  const today = todayBusinessDay();
  const [{ data: rows }, { data: snapshots }, { data: pickRows }, { data: groupMatches }] = await Promise.all([
    supabase
      .from("scores")
      .select("entry_id, total, underdog_total, upset_total, entries(display_name, paid)"),
    supabase.from("daily_standings").select("entry_id, total, rank").eq("business_day", today),
    // Picks are RLS-gated: all picks are readable once locked, which is also the only
    // time this column shows — so pre-lock the empty result is fine.
    supabase.from("picks").select("entry_id, team_id"),
    supabase.from("matches").select("status, home_team_id, away_team_id").eq("stage", "group"),
  ]);

  const scores = rows ?? [];
  if (scores.length === 0) {
    return <p className="text-center text-muted-foreground">No scores yet — check back after the first matches.</p>;
  }

  // Rank in JS with the canonical comparator (same order the SQL used) so ties
  // share a rank and movement is computed against the identical ordering.
  const ranked = rankWithTies(
    scores.map((s) => ({
      entryId: s.entry_id,
      total: Number(s.total),
      underdogTotal: Number(s.underdog_total),
      upsetTotal: Number(s.upset_total),
    })),
  );
  const byEntry = new Map(scores.map((s) => [s.entry_id, s]));
  const snapByEntry = new Map((snapshots ?? []).map((s) => [s.entry_id, { rank: s.rank, total: Number(s.total) }]));
  // Movement is meaningless before games can score — suppress the line pre-lock.
  const haveSnapshots = phase.isLocked && snapByEntry.size > 0;

  // Group-stage games played vs. remaining, per entry — context for a high total
  // (points scale with how many of your team-games have happened). Counted per team
  // appearance: a team's 3 group games × 12 picks = 36 total, and a match between two
  // of your own teams counts twice. Group-stage only for now; revisit once the
  // knockout bracket is drawn and "games left" depends on who advances.
  const teamPlayed = new Map<number, number>();
  const teamTotal = new Map<number, number>();
  for (const m of groupMatches ?? []) {
    for (const t of [m.home_team_id, m.away_team_id]) {
      if (t == null) continue;
      teamTotal.set(t, (teamTotal.get(t) ?? 0) + 1);
      if (isTerminal(m.status)) teamPlayed.set(t, (teamPlayed.get(t) ?? 0) + 1);
    }
  }
  const teamsByEntry = new Map<string, number[]>();
  for (const p of pickRows ?? []) {
    const list = teamsByEntry.get(p.entry_id) ?? [];
    list.push(p.team_id);
    teamsByEntry.set(p.entry_id, list);
  }
  const gamesFor = (entryId: string) => {
    let played = 0;
    let total = 0;
    for (const t of teamsByEntry.get(entryId) ?? []) {
      played += teamPlayed.get(t) ?? 0;
      total += teamTotal.get(t) ?? 0;
    }
    return { played, left: total - played };
  };

  // Points-per-game is a fair normalizer ONLY while the group stage is running: every
  // entry is converging on the same 36 games, so it just corrects for whose teams played
  // earlier. It's hidden below a few games (one upset skews a tiny denominator) and once
  // the group stage ends — through the knockouts a higher total legitimately means more
  // games (your teams advanced), so per-game would penalize exactly the people doing best.
  const MIN_GAMES_FOR_PPG = 3;
  const groupStageOngoing = (groupMatches ?? []).some((m) => !isTerminal(m.status));

  // Pre-lock only: entries that exist but were never submitted (full or partial draft).
  // They aren't scored or in the pool yet, so list them below the board with an
  // "Incomplete" tag as a nudge. After lock they're moot — drop them entirely.
  const drafts = phase.isLocked
    ? []
    : (
        await supabase
          .from("entries")
          .select("id, display_name")
          .is("submitted_at", null)
          .order("display_name")
      ).data ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Leaderboard
          <span className="ml-2 font-mono tracking-normal text-foreground">{ranked.length}</span>
        </h2>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link href="/payouts" className="text-neon hover:underline">Payouts</Link>
          <span className="text-muted-foreground">/</span>
          <Link href="/how-it-works" className="text-neon hover:underline">Point system</Link>
        </div>
      </div>
      <ol>
        {ranked.map((r) => {
          const s = byEntry.get(r.entryId)!;
          const e = s.entries as unknown as { display_name: string; paid: boolean };
          const move = movementFor({ rank: r.rank, total: r.total }, snapByEntry.get(r.entryId));
          const games = phase.isLocked ? gamesFor(r.entryId) : null;
          return (
            <li key={r.entryId}>
              <Link href={`/entry/${r.entryId}`} className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-accent/40 active:bg-accent/60">
                {/* Rank is meaningless pre-lock (everyone tied at 0) — hide it until scoring starts. */}
                {phase.isLocked && (
                  <span className={`w-7 text-center font-mono font-bold ${r.rank === 1 ? "text-neon" : "text-muted-foreground"}`}>{r.rank}</span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span className="truncate">{e?.display_name}</span>
                    {!e?.paid && (
                      <span className="shrink-0 rounded-full border border-border bg-card px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                        Unpaid
                      </span>
                    )}
                  </span>
                  {games && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {games.played} games played / {games.left} left in this stage
                      {groupStageOngoing && games.played >= MIN_GAMES_FOR_PPG && (
                        <>
                          {" · "}
                          <span className="font-semibold text-foreground">
                            {(r.total / games.played).toFixed(1)}
                          </span>{" "}
                          pts/game
                        </>
                      )}
                    </span>
                  )}
                </span>
                <span className="text-right">
                  <span className="block text-lg font-extrabold tabular-nums text-foreground">{s.total}</span>
                  {haveSnapshots && <MovementLine move={move} />}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      {drafts.length > 0 && (
        <ul className="border-t border-border">
          {drafts.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 border-b border-border px-4 py-3 opacity-60 last:border-0"
            >
              <span className="flex-1 truncate font-semibold text-muted-foreground">{d.display_name}</span>
              <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
                Incomplete
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** ▲/▼ + points-today, token-bound (neon up, destructive down, muted otherwise). */
function MovementLine({ move }: { move: ReturnType<typeof movementFor> }) {
  if (move.isNew) {
    return <span className="block text-[10px] font-semibold text-muted-foreground">NEW</span>;
  }
  const delta = move.rankDelta ?? 0;
  const arrow =
    delta > 0 ? (
      <span className="font-bold text-neon">▲{delta}</span>
    ) : delta < 0 ? (
      <span className="font-bold text-destructive">▼{Math.abs(delta)}</span>
    ) : (
      <span className="text-muted-foreground">–</span>
    );
  const pts = move.pointsToday ?? 0;
  return (
    <span className="block text-[10px] tabular-nums">
      {arrow}
      <span className="ml-1 text-muted-foreground">{pts > 0 ? `+${pts}` : pts} today</span>
    </span>
  );
}
