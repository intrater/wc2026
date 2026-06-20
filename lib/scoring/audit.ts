// Standing-integrity audit (pure). Runs every poll to catch the things that can
// silently make the leaderboard wrong — NOT the arithmetic (the engine is correct
// by construction), but bad INPUTS and broken invariants. The 2026-06-20 incident
// (a team mislabeled into a bogus "Stage" group → phantom placement points) is the
// canonical case these checks defend against.
//
// Pure function of explicitly-passed data so it is fully unit-testable; the DB
// gathering lives in lib/monitoring/integrity.ts.

export interface AuditViolation {
  code: string; // stable identifier; the alert fingerprint is built from the set of codes
  message: string; // human-readable, email-ready
}

export interface AuditData {
  /** Canonical stored totals. */
  scores: { entryId: string; total: number }[];
  /** entry_id -> sum of its score_lines.points (should equal its total). */
  lineSumByEntry: Map<string, number>;
  /** entry_id -> today's start-of-day snapshot total (omit entries with no snapshot). */
  snapshotTotalByEntry: Map<string, number>;
  /** Terminal group-stage matches only. */
  groupMatches: {
    fixtureId: number;
    groupLabel: string | null;
    homeTeamId: number | null;
    awayTeamId: number | null;
    homeGoals: number | null;
    awayGoals: number | null;
    winnerTeamId: number | null;
  }[];
  /** Count of matches flagged needs_attention. */
  needsAttentionCount: number;
  /** Terminal matches with no mapped stage (would be silently unscored). */
  unmappedTerminalCount: number;
  /** team_id -> tier_no. */
  tierByTeam: Map<number, number>;
  /** team_id -> how many tier rows reference it (must be exactly 1). */
  tierRowsByTeam: Map<number, number>;
  /** entry_id -> its picks. */
  picksByEntry: Map<string, { tierNo: number; teamId: number }[]>;
}

const EPS = 1e-9;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** All integrity violations in the current state (empty array = healthy). */
export function checkIntegrity(d: AuditData): AuditViolation[] {
  const v: AuditViolation[] = [];

  // C1 — every entry's score_lines must sum to its stored total.
  for (const s of d.scores) {
    const lineSum = d.lineSumByEntry.get(s.entryId) ?? 0;
    if (Math.abs(r2(lineSum) - r2(s.total)) > EPS) {
      v.push({
        code: "lines_sum_mismatch",
        message: `Entry ${s.entryId}: score_lines sum ${r2(lineSum)} ≠ stored total ${r2(s.total)}.`,
      });
    }
  }

  // C2 — MONOTONICITY CANARY: within a day, results only add points, so an entry's
  // live total must never fall below its start-of-day snapshot. A drop is the exact
  // signature of phantom/flickering points (or an unflagged result revision).
  for (const s of d.scores) {
    const snap = d.snapshotTotalByEntry.get(s.entryId);
    if (snap != null && r2(s.total) < r2(snap) - EPS) {
      v.push({
        code: "total_below_snapshot",
        message: `Entry ${s.entryId}: total dropped from ${r2(snap)} (start of day) to ${r2(s.total)} — points lost mid-day. If you just corrected a result this is expected; otherwise investigate.`,
      });
    }
  }

  // C3 — group labels must be a single real letter, and no group may exceed 6 matches.
  const perGroupCount = new Map<string, number>();
  for (const m of d.groupMatches) {
    const label = m.groupLabel;
    if (label == null || !/^[A-L]$/.test(label)) {
      v.push({
        code: "bad_group_label",
        message: `Match ${m.fixtureId} has group_label "${label}" — not a real group (A–L). This corrupts group standings & placement bonuses.`,
      });
    }
    perGroupCount.set(String(label), (perGroupCount.get(String(label)) ?? 0) + 1);
  }
  for (const [label, count] of perGroupCount) {
    if (/^[A-L]$/.test(label) && count > 6) {
      v.push({
        code: "group_overfull",
        message: `Group ${label} has ${count} terminal matches (max 6) — duplicate or misassigned fixtures.`,
      });
    }
  }

  // C4 — no team-pair plays twice in the group stage (would double-count points).
  const pairSeen = new Map<string, number[]>();
  for (const m of d.groupMatches) {
    if (m.homeTeamId == null || m.awayTeamId == null) continue;
    const key = [m.homeTeamId, m.awayTeamId].sort((a, b) => a - b).join("-");
    (pairSeen.get(key) ?? pairSeen.set(key, []).get(key)!).push(m.fixtureId);
  }
  for (const [key, fx] of pairSeen) {
    if (fx.length > 1) {
      v.push({
        code: "duplicate_matchup",
        message: `Team-pair ${key} appears in ${fx.length} terminal group matches (fixtures ${fx.join(", ")}) — double-counted points.`,
      });
    }
  }

  // C5 — winner_team_id must agree with the goals (the engine scores off the winner).
  for (const m of d.groupMatches) {
    if (m.homeGoals == null || m.awayGoals == null) continue;
    const drawn = m.homeGoals === m.awayGoals;
    if (drawn && m.winnerTeamId != null) {
      v.push({
        code: "winner_goals_mismatch",
        message: `Match ${m.fixtureId}: ${m.homeGoals}-${m.awayGoals} is a draw but winner_team_id is set.`,
      });
    } else if (!drawn) {
      const implied = m.homeGoals > m.awayGoals ? m.homeTeamId : m.awayTeamId;
      if (m.winnerTeamId !== implied) {
        v.push({
          code: "winner_goals_mismatch",
          message: `Match ${m.fixtureId}: goals ${m.homeGoals}-${m.awayGoals} imply winner ${implied} but winner_team_id is ${m.winnerTeamId}.`,
        });
      }
    }
  }

  // C6 — terminal matches that aren't being scored (unmapped stage / needs_attention).
  if (d.unmappedTerminalCount > 0) {
    v.push({
      code: "unscored_terminal_matches",
      message: `${d.unmappedTerminalCount} terminal match(es) have no mapped stage and are excluded from scoring.`,
    });
  }
  if (d.needsAttentionCount > 0) {
    v.push({
      code: "needs_attention",
      message: `${d.needsAttentionCount} match(es) flagged needs_attention — review /admin.`,
    });
  }

  // C7 — every team sits in exactly one tier.
  for (const [teamId, count] of d.tierRowsByTeam) {
    if (count !== 1) {
      v.push({
        code: "team_tier_count",
        message: `Team ${teamId} appears in ${count} tier rows (must be exactly 1).`,
      });
    }
  }

  // C8 — each submitted entry has exactly one pick per tier 1–12, each matching the
  // team's real frozen tier.
  for (const [entryId, picks] of d.picksByEntry) {
    const tierNos = picks.map((p) => p.tierNo).sort((a, b) => a - b);
    const expected = Array.from({ length: 12 }, (_, i) => i + 1);
    if (tierNos.length !== 12 || expected.some((t, i) => tierNos[i] !== t)) {
      v.push({
        code: "pick_tier_structure",
        message: `Entry ${entryId} does not have exactly one pick per tier 1–12 (got [${tierNos.join(",")}]).`,
      });
    }
    for (const p of picks) {
      const realTier = d.tierByTeam.get(p.teamId);
      if (realTier !== p.tierNo) {
        v.push({
          code: "pick_tier_mismatch",
          message: `Entry ${entryId}: pick for tier ${p.tierNo} is team ${p.teamId}, whose real tier is ${realTier}.`,
        });
      }
    }
  }

  return v;
}

/** Stable fingerprint of a violation set — the distinct sorted codes. Same set of
 *  problem types → same fingerprint, so the alerter sends one email per new kind of
 *  issue rather than one every poll. */
export function fingerprint(violations: AuditViolation[]): string {
  return [...new Set(violations.map((x) => x.code))].sort().join(",");
}
