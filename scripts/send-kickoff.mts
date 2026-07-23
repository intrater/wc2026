// One-off kickoff email blast (untracked). Sends the welcome email to every
// submitted entrant via Resend with Reply-To set to John's Gmail.
//   Test (sends ONLY to ADMIN_EMAIL):  npx tsx scripts/send-kickoff.mts --test
//   Real blast now (SMTP):             npx tsx scripts/send-kickoff.mts --send
//   Schedule for 12:05pm ET June 11:   npx tsx scripts/send-kickoff.mts --schedule
//   Late signups only (run post-lock): npx tsx scripts/send-kickoff.mts --catchup
//     → sends immediately, but ONLY to entrants whose email is not already in
//       scripts/kickoff-scheduled.json. Safe to run repeatedly? NO — it doesn't
//       record who it sent to; run it once after lock.
// --schedule uses Resend's REST API (SMTP_PASS is the API key) so delivery is
// queued on Resend's servers and fires on time with no local machine involved.
// Scheduled email IDs are written to scripts/kickoff-scheduled.json (cancel via
// POST https://api.resend.com/emails/{id}/cancel).
import nodemailer from "nodemailer";
import { readFileSync, writeFileSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";

// Picks lock 2026-06-11T16:00:00Z (noon ET); deliver five minutes after.
const SCHEDULED_AT = "2026-06-11T16:05:00Z";
const REPLY_TO = "John Intrater <john.intrater@gmail.com>";
const SUBJECT = "We're live. Welcome to the World Cup pool ⚽️";
const SITE = "https://wc2026.johnintrater.com";

// Single source for both the HTML body (bold headers) and the plain-text fallback.
const PARAS: Array<{ head?: string; body: string }> = [
  { body: "Hey everyone," },
  {
    body: "Picks are locked, the bracket is set, and the first whistle is almost here. Welcome officially to the pool. I'm pumped for this World Cup and even more pumped to sweat every group stage match with all of you for the next month.",
  },
  { body: `A quick tour of what's on the site (${SITE}) now that we're in tournament mode:` },
  {
    head: "🏆 THE LEADERBOARD",
    body: "The home page is now live standings. You'll see everyone's total, who's climbing, who's falling, and points earned today. It updates automatically every few minutes as games finish.",
  },
  {
    head: "⚽️ MATCHES",
    body: "The full schedule, day by day, with live scores while games are being played. Your teams are highlighted so you know exactly when to start caring (or panicking).",
  },
  {
    head: "📋 MY TEAM",
    body: "Your 12 picks with a full points breakdown: every win, draw, goal bonus, and upset, match by match.",
  },
  {
    head: "☕️ THE DIGEST",
    body: "Every morning you'll find a recap of yesterday's action on the Digest tab: results, the big movers, upsets, and what's on today's slate. If you want it delivered to your inbox around 7am, there's a sign-up toggle at the top of that page. Totally optional.",
  },
  {
    head: "📱 PRO TIP",
    body: 'Add the site to your iPhone home screen for one-tap access. Open it in Safari, tap the Share button, then "Add to Home Screen." It\'ll sit there like an app all tournament.',
  },
  {
    body: "One thing I want to share transparently: I built this entire web app soup to nuts on my own using my friend Claude Code (including this email). I know I'm crazy, but this is the kind of thing I do for fun on weekends. If you see anything funky or any issues, just ping me and I'll get it sorted.",
  },
  {
    body: "Also, a few of us have a text thread going. If you want in, just tell me and I'll add you. It can get noisy, but it's fun.",
  },
  { body: "Good luck to everyone." },
  { body: "John" },
];

const TEXT = PARAS.map((p) => (p.head ? `${p.head}\n${p.body}` : p.body)).join("\n\n");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const linkify = (s: string) =>
  s.replace(SITE, `<a href="${SITE}" style="color: #4f46e5;">wc2026.johnintrater.com</a>`);
const HTML =
  `<div style="font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.55; color: #111827; max-width: 560px;">` +
  PARAS.map((p) =>
    p.head
      ? `<p style="margin: 16px 0;"><strong>${esc(p.head)}</strong><br>${linkify(esc(p.body))}</p>`
      : `<p style="margin: 16px 0;">${linkify(esc(p.body))}</p>`,
  ).join("") +
  `</div>`;

const mode = process.argv[2];
if (
  mode !== "--test" &&
  mode !== "--send" &&
  mode !== "--schedule" &&
  mode !== "--catchup" &&
  mode !== "--add"
) {
  console.error(
    "Usage: npx tsx scripts/send-kickoff.mts --test | --send | --schedule | --catchup | --add <email>",
  );
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
const from = process.env.EMAIL_FROM ?? process.env.SMTP_USER;

let recipients: string[];
if (mode === "--test") {
  recipients = [process.env.ADMIN_EMAIL ?? "john.intrater@gmail.com"];
} else if (mode === "--add") {
  const email = (process.argv[3] ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    console.error("--add requires an email address");
    process.exit(1);
  }
  const already = new Set(
    (
      JSON.parse(readFileSync("scripts/kickoff-scheduled.json", "utf8")) as {
        emails: Array<{ to: string }>;
      }
    ).emails.map((e) => e.to.toLowerCase()),
  );
  if (already.has(email)) {
    console.log(`${email} is already in the batch. nothing to do.`);
    process.exit(0);
  }
  recipients = [email];
} else {
  const admin = createAdminClient();
  const [{ data: entries }, { data: profiles }] = await Promise.all([
    admin.from("entries").select("user_id").not("submitted_at", "is", null),
    admin.from("profiles").select("user_id, email").not("email", "is", null),
  ]);
  const entrantIds = new Set((entries ?? []).map((e) => e.user_id));
  recipients = [
    ...new Set(
      (profiles ?? [])
        .filter((p) => entrantIds.has(p.user_id))
        .map((p) => (p.email as string).toLowerCase()),
    ),
  ];
  if (mode === "--catchup") {
    const already = new Set(
      (
        JSON.parse(readFileSync("scripts/kickoff-scheduled.json", "utf8")) as {
          emails: Array<{ to: string }>;
        }
      ).emails.map((e) => e.to.toLowerCase()),
    );
    recipients = recipients.filter((to) => !already.has(to));
    console.log(`catchup: ${recipients.length} entrant(s) not in the scheduled batch`);
    if (recipients.length === 0) {
      console.log("nothing to do.");
      process.exit(0);
    }
  }
}

console.log(
  `${mode === "--test" ? "TEST" : mode === "--schedule" ? `SCHEDULE (${SCHEDULED_AT})` : "REAL"} send to ${recipients.length} recipient(s)`,
);

let sent = 0;
let failed = 0;

if (mode === "--schedule" || mode === "--add") {
  // Resend REST API: one request per recipient (keeps addresses private),
  // throttled under the 2 req/s default rate limit.
  const apiKey = process.env.SMTP_PASS!;
  // --add appends to the existing batch file; --schedule starts it fresh.
  const scheduled: Array<{ to: string; id: string }> =
    mode === "--add"
      ? (
          JSON.parse(readFileSync("scripts/kickoff-scheduled.json", "utf8")) as {
            emails: Array<{ to: string; id: string }>;
          }
        ).emails
      : [];
  for (const to of recipients) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          reply_to: REPLY_TO,
          subject: SUBJECT,
          text: TEXT,
          html: HTML,
          scheduled_at: SCHEDULED_AT,
        }),
      });
      const body = (await res.json()) as { id?: string; message?: string };
      if (!res.ok || !body.id) throw new Error(body.message ?? `HTTP ${res.status}`);
      scheduled.push({ to, id: body.id });
      sent++;
      console.log(`  scheduled: ${to} (${body.id})`);
    } catch (e) {
      failed++;
      console.error(`  FAILED: ${to}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  writeFileSync(
    "scripts/kickoff-scheduled.json",
    JSON.stringify({ scheduled_at: SCHEDULED_AT, emails: scheduled }, null, 2),
  );
} else {
  for (const to of recipients) {
    try {
      await transport.sendMail({ from, to, replyTo: REPLY_TO, subject: SUBJECT, text: TEXT, html: HTML });
      sent++;
      console.log(`  sent: ${to}`);
    } catch (e) {
      failed++;
      console.error(`  FAILED: ${to}: ${e instanceof Error ? e.message : e}`);
    }
  }
}
console.log(
  `done. ${mode === "--schedule" || mode === "--add" ? "scheduled" : "sent"}=${sent} failed=${failed}`,
);
