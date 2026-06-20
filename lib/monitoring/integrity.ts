// Standings-integrity alerting. Loads the current state, runs the pure audit
// (lib/scoring/audit.ts), and emails the admin when something is wrong — throttled
// via integrity_alert_state so it sends ONE email per new issue (plus one when it
// clears), not one every 3-minute poll. Wired into /api/poll after ingest+recompute.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkIntegrity, fingerprint, type AuditData } from "@/lib/scoring/audit";
import { TERMINAL_STATUSES, todayBusinessDay } from "@/lib/matches/day";
import { sendEmail } from "@/lib/email/send";

const isTerminal = (s: string) => (TERMINAL_STATUSES as readonly string[]).includes(s);
const RESEND_AFTER_MS = 24 * 60 * 60 * 1000; // re-nag on a still-open issue once a day

async function loadAuditData(admin: SupabaseClient, now: number): Promise<AuditData> {
  const [scoresRes, linesRes, snapRes, matchesRes, tiersRes, entriesRes, picksRes] =
    await Promise.all([
      admin.from("scores").select("entry_id, total"),
      admin.from("score_lines").select("entry_id, points"),
      admin.from("daily_standings").select("entry_id, total").eq("business_day", todayBusinessDay(now)),
      admin.from("matches").select("fixture_id, stage, status, group_label, home_team_id, away_team_id, home_goals, away_goals, winner_team_id, needs_attention"),
      admin.from("tiers").select("team_id, tier_no"),
      admin.from("entries").select("id").not("submitted_at", "is", null),
      admin.from("picks").select("entry_id, tier_no, team_id"),
    ]);
  for (const r of [scoresRes, linesRes, snapRes, matchesRes, tiersRes, entriesRes, picksRes]) {
    if (r.error) throw new Error(`loadAuditData: ${r.error.message}`);
  }

  const lineSumByEntry = new Map<string, number>();
  for (const l of linesRes.data ?? [])
    lineSumByEntry.set(l.entry_id, (lineSumByEntry.get(l.entry_id) ?? 0) + Number(l.points));

  const snapshotTotalByEntry = new Map<string, number>();
  for (const s of snapRes.data ?? []) snapshotTotalByEntry.set(s.entry_id, Number(s.total));

  const matches = matchesRes.data ?? [];
  const groupMatches = matches
    .filter((m) => m.stage === "group" && isTerminal(m.status))
    .map((m) => ({
      fixtureId: m.fixture_id,
      groupLabel: m.group_label,
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      homeGoals: m.home_goals,
      awayGoals: m.away_goals,
      winnerTeamId: m.winner_team_id,
    }));

  const tierByTeam = new Map<number, number>();
  const tierRowsByTeam = new Map<number, number>();
  for (const t of tiersRes.data ?? []) {
    tierByTeam.set(t.team_id, t.tier_no);
    tierRowsByTeam.set(t.team_id, (tierRowsByTeam.get(t.team_id) ?? 0) + 1);
  }

  const submitted = new Set((entriesRes.data ?? []).map((e) => e.id));
  const picksByEntry = new Map<string, { tierNo: number; teamId: number }[]>();
  for (const p of picksRes.data ?? []) {
    if (!submitted.has(p.entry_id)) continue;
    const arr = picksByEntry.get(p.entry_id) ?? [];
    arr.push({ tierNo: p.tier_no, teamId: p.team_id });
    picksByEntry.set(p.entry_id, arr);
  }

  return {
    scores: (scoresRes.data ?? []).map((s) => ({ entryId: s.entry_id, total: Number(s.total) })),
    lineSumByEntry,
    snapshotTotalByEntry,
    groupMatches,
    needsAttentionCount: matches.filter((m) => m.needs_attention).length,
    unmappedTerminalCount: matches.filter((m) => m.stage == null && isTerminal(m.status)).length,
    tierByTeam,
    tierRowsByTeam,
    picksByEntry,
  };
}

const adminEmail = () => process.env.ADMIN_EMAIL ?? "john.intrater@gmail.com";
const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wc2026.johnintrater.com";

/**
 * Run the audit and alert by email, throttled. Returns a status object for the poll
 * response so the result is visible without opening logs.
 */
export async function maybeAlertIntegrity(
  admin: SupabaseClient,
  now: number = Date.now(),
): Promise<{ violations: number; fingerprint: string; emailed: boolean; action: string }> {
  const data = await loadAuditData(admin, now);
  const violations = checkIntegrity(data);
  const fp = fingerprint(violations);

  const { data: state } = await admin
    .from("integrity_alert_state")
    .select("fingerprint, alerted_at")
    .eq("id", true)
    .maybeSingle();
  const prevFp = state?.fingerprint ?? null;
  const prevAt = state?.alerted_at ? new Date(state.alerted_at).getTime() : 0;

  // Healthy now.
  if (fp === "") {
    if (prevFp) {
      await sendEmail(
        adminEmail(),
        "✅ WC2026 pool: standings integrity restored",
        `The previously-reported integrity issue (${prevFp}) is no longer detected. Standings look consistent again.\n\n${appUrl}`,
      );
      await admin.from("integrity_alert_state").update({ fingerprint: null, alerted_at: new Date(now).toISOString() }).eq("id", true);
      return { violations: 0, fingerprint: "", emailed: true, action: "resolved" };
    }
    return { violations: 0, fingerprint: "", emailed: false, action: "healthy" };
  }

  // Issues present. Email on a NEW issue set, or re-nag a still-open one once a day.
  const isNew = fp !== prevFp;
  const stale = now - prevAt > RESEND_AFTER_MS;
  if (isNew || stale) {
    const body =
      `Standings-integrity audit found ${violations.length} issue(s) on the WC2026 pool.\n` +
      `${isNew ? "" : "(still open — daily reminder)\n"}\n` +
      violations.slice(0, 40).map((v) => `• [${v.code}] ${v.message}`).join("\n") +
      (violations.length > 40 ? `\n…and ${violations.length - 40} more.` : "") +
      `\n\nThe leaderboard math itself is correct by construction; these flag bad INPUTS or broken invariants.\nReview: ${appUrl}/admin`;
    const res = await sendEmail(adminEmail(), "⚠️ WC2026 pool: standings integrity issue", body);
    await admin
      .from("integrity_alert_state")
      .update({ fingerprint: fp, alerted_at: new Date(now).toISOString() })
      .eq("id", true);
    return { violations: violations.length, fingerprint: fp, emailed: res.sent, action: isNew ? "new" : "reminder" };
  }

  return { violations: violations.length, fingerprint: fp, emailed: false, action: "throttled" };
}
