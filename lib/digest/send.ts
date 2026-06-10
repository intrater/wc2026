// Morning digest email send (poll stage 4). The first poll at/after 7:00am ET
// with an un-emailed recap for exactly yesterday claims it atomically (emailed_at)
// and blasts the opt-in subscribers. The recap stage runs earlier in the same
// poll, so Claude gets a final narrative attempt before the send; a still-null
// narrative ships the stats fallback rather than holding the email.
//
// Accepted failure mode: a crash after the claim drops that morning's email.
// Admin re-send: update recaps set emailed_at = null, email_log = null where business_day = '...'.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecapStats } from "@/lib/db/types";
import { formatBusinessDayLabel, todayBusinessDay, yesterdayBusinessDay } from "@/lib/matches/day";
import { sendEmail } from "@/lib/email/send";
import { buildDocket, type DocketMatchRow } from "./docket";
import { buildDigestText, digestSubject } from "./email";
import { shouldSendDigest } from "./schedule";
import { unsubscribeUrl } from "./token";

export interface DigestStageResult {
  day: string;
  skipped?: string;
  sent?: number;
  failed?: number;
  subscribers?: number;
}

export async function maybeSendDigest(
  admin: SupabaseClient,
  now: number = Date.now(),
): Promise<DigestStageResult> {
  const day = yesterdayBusinessDay(now);

  const secret = process.env.DIGEST_LINK_SECRET;
  if (!secret) {
    console.warn("[digest] DIGEST_LINK_SECRET not set — digest email disabled");
    return { day, skipped: "no_digest_link_secret" };
  }

  const { data: recap, error: rErr } = await admin
    .from("recaps")
    .select("business_day, stats, narrative, emailed_at")
    .eq("business_day", day)
    .maybeSingle();
  if (rErr) throw new Error(`digest: ${rErr.message}`);

  const decision = shouldSendDigest(now, recap);
  if (!decision.send) return { day, skipped: decision.reason };

  // Atomic claim: exactly one poll invocation wins the send for this day.
  const { data: claimed, error: cErr } = await admin
    .from("recaps")
    .update({ emailed_at: new Date(now).toISOString() })
    .eq("business_day", day)
    .is("emailed_at", null)
    .select("business_day");
  if (cErr) throw new Error(`digest claim: ${cErr.message}`);
  if (!claimed || claimed.length === 0) return { day, skipped: "claimed_by_other_invocation" };

  // Recipients: opted-in profiles ∩ submitted entries (joined in JS — entries
  // reference auth.users, not profiles, so PostgREST can't embed across them).
  const [{ data: profiles, error: pErr }, { data: entries, error: eErr }] = await Promise.all([
    admin
      .from("profiles")
      .select("user_id, email")
      .eq("digest_opt_in", true)
      .not("email", "is", null),
    admin.from("entries").select("id, user_id").not("submitted_at", "is", null),
  ]);
  if (pErr) throw new Error(`digest profiles: ${pErr.message}`);
  if (eErr) throw new Error(`digest entries: ${eErr.message}`);

  const entryByUser = new Map((entries ?? []).map((e) => [e.user_id, e.id]));
  const recipients = (profiles ?? [])
    .filter((p) => entryByUser.has(p.user_id))
    .map((p) => ({ userId: p.user_id, email: p.email as string, entryId: entryByUser.get(p.user_id)! }));

  if (recipients.length === 0) {
    await admin
      .from("recaps")
      .update({ email_log: { sent: [], failed: [] } })
      .eq("business_day", day);
    return { day, subscribers: 0, sent: 0, failed: 0 };
  }

  // Today's docket, fetched fresh so overnight postponements are reflected.
  const today = todayBusinessDay(now);
  const [{ data: matches, error: mErr }, { data: teams, error: tErr }] = await Promise.all([
    admin
      .from("matches")
      .select(
        "fixture_id, stage, group_label, kickoff, status, home_team_id, away_team_id, live_home_goals, live_away_goals",
      )
      .not("kickoff", "is", null),
    admin.from("teams").select("id, name, flag"),
  ]);
  if (mErr) throw new Error(`digest matches: ${mErr.message}`);
  if (tErr) throw new Error(`digest teams: ${tErr.message}`);
  const teamMap = new Map((teams ?? []).map((t) => [t.id, { name: t.name, flag: t.flag }]));
  const docket = buildDocket((matches ?? []) as DocketMatchRow[], teamMap, today);

  const stats = recap!.stats as RecapStats;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const subject = digestSubject(stats);

  const outcomes = await Promise.allSettled(
    recipients.map(async (r) => {
      const text = buildDigestText({
        stats,
        narrative: recap!.narrative,
        dayLabel: formatBusinessDayLabel(day),
        todayLabel: formatBusinessDayLabel(today),
        docket,
        unsubscribeUrl: unsubscribeUrl(siteUrl, r.userId, secret),
      });
      const result = await sendEmail(r.email, subject, text);
      if (!result.sent) throw new Error(result.reason ?? "send_failed");
    }),
  );

  // email_log holds entry_ids only — never emails (recaps is pool-readable).
  const sent: string[] = [];
  const failed: string[] = [];
  outcomes.forEach((o, i) => {
    (o.status === "fulfilled" ? sent : failed).push(recipients[i].entryId);
  });

  await admin.from("recaps").update({ email_log: { sent, failed } }).eq("business_day", day);

  return { day, subscribers: recipients.length, sent: sent.length, failed: failed.length };
}
