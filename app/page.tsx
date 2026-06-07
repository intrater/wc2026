import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/server";
import { getPhase } from "@/lib/state/phase";
import { LockCountdown } from "@/components/LockCountdown";
import { SharePool } from "@/components/SharePool";
import { rankWithTies, movementFor } from "@/lib/standings/snapshot";
import { todayBusinessDay } from "@/lib/matches/day";

export const dynamic = "force-dynamic";

export default async function HomePage() {
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
    <div className="space-y-6">
      <header className="pt-4 text-center">
        <h1 className="font-display text-6xl font-extrabold leading-[0.95] sm:text-7xl">
          THE <span className="text-neon text-glow">POOL</span>
        </h1>
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.35em] text-muted-foreground">
          World Cup 2026
        </p>
        {!phase.isLocked && lockAt && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold text-neon">
            <LockCountdown lockAt={lockAt} />
          </p>
        )}
      </header>

      {showBoard ? (
        /* Tracking mode (submitted pre-lock, or anyone post-lock): the board IS the
           page — no "How it works" noise. Editing drops to the bottom, pre-lock only. */
        <>
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

async function Leaderboard({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
  const phase = await getPhase(); // cached per-request
  const today = todayBusinessDay();
  const [{ data: rows }, { data: snapshots }] = await Promise.all([
    supabase
      .from("scores")
      .select("entry_id, total, group_stage_total, underdog_total, upset_total, entries(display_name)"),
    supabase.from("daily_standings").select("entry_id, total, rank").eq("business_day", today),
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

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Leaderboard</h2>
        <Link href="/rosters" className="text-sm font-semibold text-neon hover:underline">All rosters</Link>
      </div>
      <ol>
        {ranked.map((r) => {
          const s = byEntry.get(r.entryId)!;
          const e = s.entries as unknown as { display_name: string };
          const move = movementFor({ rank: r.rank, total: r.total }, snapByEntry.get(r.entryId));
          return (
            <li key={r.entryId}>
              <Link href={`/entry/${r.entryId}`} className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-accent/40">
                <span className={`w-7 text-center font-mono font-bold ${r.rank === 1 ? "text-neon" : "text-muted-foreground"}`}>{r.rank}</span>
                <span className="flex-1 font-semibold">{e?.display_name}</span>
                <span className="text-right">
                  <span className="block text-lg font-extrabold tabular-nums text-foreground">{s.total}</span>
                  <span className="block text-xs text-muted-foreground">grp {s.group_stage_total}</span>
                  {haveSnapshots && <MovementLine move={move} />}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
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
