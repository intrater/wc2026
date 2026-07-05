// ONE-TIME (2026-06-12): send the first morning digest to every submitted
// entrant who has NOT opted in, framed as a sample with a subscribe CTA.
// Subscribers are excluded — they get the real 7am send from the cron.
// Usage: npx tsx --env-file=.env.local scripts/send-digest-sample.mts [--send]
// (default is dry-run: prints recipients + the exact email body, sends nothing)
import { createClient } from "@supabase/supabase-js";
import type { RecapStats } from "@/lib/db/types";
import { formatBusinessDayLabel, todayBusinessDay } from "@/lib/matches/day";
import { sendEmail } from "@/lib/email/send";
import { buildDocket, type DocketMatchRow } from "@/lib/digest/docket";
import { buildDigestText, digestSubject } from "@/lib/digest/email";
import { digestSig } from "@/lib/digest/token";

const DAY = "2026-06-11";
const SITE = "https://wc2026.johnintrater.com";
const doSend = process.argv.includes("--send");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const { data: recap } = await admin
  .from("recaps")
  .select("stats, narrative")
  .eq("business_day", DAY)
  .single();
if (!recap) throw new Error(`no recap for ${DAY}`);

const [{ data: profiles }, { data: entries }] = await Promise.all([
  admin.from("profiles").select("user_id, email, digest_opt_in").not("email", "is", null),
  admin.from("entries").select("id, user_id, display_name").not("submitted_at", "is", null),
]);
const profByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));
const recipients = (entries ?? [])
  .map((e) => ({ entry: e, prof: profByUser.get(e.user_id) }))
  .filter((r) => r.prof && !r.prof.digest_opt_in)
  .map((r) => ({
    email: r.prof!.email as string,
    name: r.entry.display_name,
    userId: r.entry.user_id as string,
  }));

const today = todayBusinessDay();
const [{ data: matches }, { data: teams }] = await Promise.all([
  admin
    .from("matches")
    .select(
      "fixture_id, stage, group_label, kickoff, status, home_team_id, away_team_id, live_home_goals, live_away_goals",
    )
    .not("kickoff", "is", null),
  admin.from("teams").select("id, name, flag"),
]);
const teamMap = new Map((teams ?? []).map((t) => [t.id, { name: t.name, flag: t.flag }]));
const docket = buildDocket((matches ?? []) as DocketMatchRow[], teamMap, today);

const stats = recap.stats as RecapStats;
const digestBody = buildDigestText({
  stats,
  narrative: recap.narrative,
  dayLabel: formatBusinessDayLabel(DAY),
  todayLabel: formatBusinessDayLabel(today),
  docket,
  unsubscribeUrl: "PLACEHOLDER",
}).replace(/You get this because[\s\S]*$/, "");

const secret = process.env.DIGEST_LINK_SECRET;
if (!secret) throw new Error("DIGEST_LINK_SECRET not set");
const subscribeUrl = (userId: string) =>
  `${SITE}/subscribe?uid=${userId}&sig=${digestSig(userId, secret)}`;

// Per-recipient: the subscribe link is HMAC-signed, so it's truly one tap —
// no sign-in required (mirrors the unsubscribe links).
const textFor = (userId: string) => {
  const url = subscribeUrl(userId);
  const intro = [
    "☕ ONE-TIME SAMPLE",
    "",
    "This is the morning digest — the same recap that's on the site every day,",
    "delivered to your inbox with your coffee. Like it? Get it daily with one tap",
    "(no sign-in needed):",
    "",
    url,
    "",
    "Do nothing and you won't get this email again — the digest will keep living",
    "on the site every morning either way.",
    "",
    "—————————————————————",
    "",
  ].join("\n");
  const footer = `\nThis was a one-time sample. Get it daily: ${url}`;
  return intro + digestBody + footer;
};

const subject = digestSubject(stats);

console.log(`Subject: ${subject}`);
console.log(`Recipients (${recipients.length}):`, recipients.map((r) => r.name).join(", "));
if (!doSend) {
  console.log("\n--- DRY RUN: email body below (first recipient) ---\n");
  console.log(textFor(recipients[0].userId));
  process.exit(0);
}

let sent = 0;
let failed = 0;
for (const r of recipients) {
  const result = await sendEmail(r.email, subject, textFor(r.userId));
  if (result.sent) sent++;
  else {
    failed++;
    console.error(`FAILED ${r.name}: ${result.reason}`);
  }
  await new Promise((res) => setTimeout(res, 700)); // Resend rate limit
}
console.log(`DONE sent=${sent} failed=${failed} of ${recipients.length}`);
