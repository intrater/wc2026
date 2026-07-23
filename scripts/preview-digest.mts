// Untracked tuning aid: composes a sample Day-1 morning digest using REAL
// fixtures/teams/entrant names from the DB with FABRICATED scores, runs the
// real Claude narrative prompt, and prints the exact email a subscriber
// would receive. Run: set -a; source .env.local; set +a; npx tsx scripts/preview-digest.mts
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/recap/prompt";
import { buildDigestText, digestSubject } from "@/lib/digest/email";
import { buildDocket, type DocketMatchRow } from "@/lib/digest/docket";
import { businessDayOf, formatBusinessDayLabel, formatKickoffTimeET } from "@/lib/matches/day";
import type { RecapStats } from "@/lib/db/types";

const DAY = "2026-06-11"; // the recapped day (Day 1)
const TODAY = "2026-06-12"; // the morning the email lands

const admin = createAdminClient();
const [{ data: matches }, { data: teams }, { data: entries }] = await Promise.all([
  admin
    .from("matches")
    .select(
      "fixture_id, stage, group_label, kickoff, status, home_team_id, away_team_id, live_home_goals, live_away_goals",
    )
    .not("kickoff", "is", null),
  admin.from("teams").select("id, name, flag"),
  admin.from("entries").select("id, display_name").not("submitted_at", "is", null),
]);

const teamMap = new Map((teams ?? []).map((t) => [t.id, { name: t.name, flag: t.flag }]));
const onDay = (day: string) =>
  (matches ?? []).filter((m) => m.kickoff && businessDayOf(m.kickoff) === day);

const day1 = onDay(DAY);
if (day1.length === 0) throw new Error(`no fixtures found on ${DAY}`);

// Fabricated but plausible Day-1 scorelines over the real fixtures.
const FAKE_SCORES = [
  [2, 1],
  [0, 0],
  [1, 3],
  [4, 0],
];
const results: RecapStats["results"] = day1.map((m, i) => {
  const [hg, ag] = FAKE_SCORES[i % FAKE_SCORES.length];
  const home = m.home_team_id != null ? teamMap.get(m.home_team_id) : undefined;
  const away = m.away_team_id != null ? teamMap.get(m.away_team_id) : undefined;
  return {
    fixtureId: m.fixture_id,
    stage: m.stage,
    groupLabel: m.group_label,
    home: home ? { ...home, goals: hg } : null,
    away: away ? { ...away, goals: ag } : null,
    decidedBy: "regulation" as const,
  };
});

// Real entrant names, fabricated movement. Top mover jumps 5th → 1st.
const names = (entries ?? []).map((e) => e.display_name);
const POINTS = [12, 8, 6, 4, 2];
const DELTAS = [4, 1, 0, -2, 1];
const statEntries: RecapStats["entries"] = names.map((displayName, i) => ({
  entryId: `sample-${i}`,
  displayName,
  total: Math.max(16 - i * 2, 1),
  pointsToday: i < POINTS.length ? POINTS[i] : 0,
  rank: i + 1,
  rankDelta: i < DELTAS.length ? DELTAS[i] : 0,
}));

// An upset + goal-bonus standout drawn from the real Day-1 teams.
const upsetTeam = results.find((r) => (r.away?.goals ?? 0) > (r.home?.goals ?? 0))?.away;
const goalTeam = results.reduce((a, b) =>
  Math.max(b.home?.goals ?? 0, b.away?.goals ?? 0) > Math.max(a.home?.goals ?? 0, a.away?.goals ?? 0) ? b : a,
);
const goalSide = (goalTeam.home?.goals ?? 0) >= (goalTeam.away?.goals ?? 0) ? goalTeam.home : goalTeam.away;

const day2 = onDay(TODAY);
const stats: RecapStats = {
  dayNumber: 1,
  results,
  entries: statEntries,
  topGainer: names[0] ?? null,
  biggestFaller: names[3] ?? null,
  upsets: upsetTeam ? [{ teamName: upsetTeam.name, label: "Upset win (+5)", points: 5 }] : [],
  goalBonusStandouts: goalSide ? [{ teamName: goalSide.name, goals: goalSide.goals }] : [],
  topThree: names.slice(0, 3),
  ...(day2.length > 0
    ? {
        lookAhead: {
          day: TODAY,
          fixtures: day2
            .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""))
            .map((m) => ({
              home: m.home_team_id != null ? teamMap.get(m.home_team_id) ?? null : null,
              away: m.away_team_id != null ? teamMap.get(m.away_team_id) ?? null : null,
              stage: m.stage,
              groupLabel: m.group_label,
              kickoffET: formatKickoffTimeET(m.kickoff!),
            })),
        },
      }
    : {}),
};

// The real narrative call — same model/prompt as production.
const client = new Anthropic();
const response = await client.messages.create({
  model: "claude-opus-4-8",
  max_tokens: 1024,
  system: SYSTEM_PROMPT,
  messages: [{ role: "user", content: buildUserPrompt(stats) }],
});
const narrative = response.content
  .filter((b): b is Anthropic.TextBlock => b.type === "text")
  .map((b) => b.text)
  .join("")
  .trim();

const docket = buildDocket(day2 as DocketMatchRow[], teamMap, TODAY);
const text = buildDigestText({
  stats,
  narrative,
  dayLabel: formatBusinessDayLabel(DAY),
  todayLabel: formatBusinessDayLabel(TODAY),
  docket,
  unsubscribeUrl: "https://wc2026.johnintrater.com/unsubscribe?uid=...&sig=...",
});

console.log(`SUBJECT: ${digestSubject(stats)}`);
console.log("=".repeat(60));
console.log(text);
