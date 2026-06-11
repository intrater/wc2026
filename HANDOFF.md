# Handoff — continuing on another machine

Everything is on `main` and live in production at **https://wc2026.johnintrater.com**.
Use this to pick up from a fresh Claude Code session. Good first prompt:
*"Read HANDOFF.md, then review the codebase to get fully up to speed."*

## Where things stand (updated 2026-06-11, launch day)

- **The pool is live and locked-in**: 27 submitted entries, tiers frozen, picks lock
  **2026-06-11 12:00 ET** (`settings.lock_at = 16:00 UTC`). At lock the site flips to
  tournament mode (leaderboard home, rosters public, picks frozen — see `lib/state/phase.ts`
  and RLS migration `0004_post_lock_privacy.sql`).
- **Kickoff welcome email**: queued server-side on Resend for **12:05 PM ET today**, one
  scheduled message per entrant. IDs + recipient list live in the *untracked*
  `scripts/kickoff-scheduled.json` (see "Untracked scripts" below).
- **Tournament mode is fully shipped** (plan: `docs/plans/2026-06-07-001-feat-tournament-mode-plan.md`):
  match calendar with live scores, daily movement on the leaderboard, nightly Claude-written
  recap, opt-in 7am ET digest email.

## Live resources

- **App (prod):** https://wc2026.johnintrater.com (Vercel alias: wc2026-pool-psi.vercel.app)
- **GitHub:** https://github.com/intrater/wc2026 (`main` is current; repo is publicly
  visible via the site's colophon — never commit secrets or entrant PII)
- **Vercel project:** `wc2026-pool` · **Supabase project ref:** `qqdbhuyuoeetnulaxolv`
- **Plans:** `docs/plans/` (original build + tournament mode; Section 0 of each = status)

## Set up the new machine (~2 min)

Secrets live in `.env.local` (gitignored — NOT in the repo) and in Vercel. To restore:
```bash
git clone https://github.com/intrater/wc2026 && cd wc2026
npm install
npm i -g vercel
vercel login && vercel link      # pick wc2026-pool; say YES when it offers to pull env vars
gh auth login                     # choose HTTPS for git operations
```
(`vercel link` pulls the **development** env by default — it mirrors prod, but if a var is
missing run `vercel env pull .env.local --environment=production`.)

Then in Claude Code, re-authorize the **Supabase MCP** if prompted (OAuth). Most DB work
doesn't need it — the service-role key in `.env.local` covers ad-hoc queries via
`npx tsx --env-file=.env.local <script>`.

## Verify the setup works

```bash
npm run build && npx vitest run     # should compile + 107 tests pass
```

## How the machine runs itself (read before touching prod)

- **Vercel cron hits `/api/poll` every 3 min** (`vercel.json`), authenticated by
  `CRON_SECRET`. Stage order is load-bearing: daily standings snapshot → API-Football
  ingest + full score recompute → recap generation (Claude, once the day's last match
  resolves) → digest email blast (first poll after 7am ET, atomic claim so overlapping
  crons can't double-send). See `app/api/poll/route.ts`.
- **Scoring is a pure, idempotent recompute** (`lib/scoring/engine.ts`) — full replace of
  `scores` + `score_lines` every ingest. Live scores are display-only columns; only
  terminal results feed scoring.
- **All email goes through Resend SMTP** (`smtp.resend.com`, from
  `pool@wc2026.johnintrater.com`): Supabase auth magic links, pick receipts, the daily
  digest, and the kickoff blast. There is no Gmail anywhere (older comments saying
  otherwise are stale).
- **Admin** (`/admin`, gated by `ADMIN_EMAIL`): toggle paid, override results
  (`manual_override` is sticky — ingest skips those fixtures), manual ingest, lock/freeze.

## Untracked scripts (this machine only — copy manually, do NOT commit)

`scripts/` holds three files that are deliberately untracked because the repo is public
and `kickoff-scheduled.json` contains entrant email addresses:

- `scripts/send-kickoff.mts` — kickoff blast tool. Modes: `--test`, `--send`,
  `--schedule`, `--catchup` (immediate send to entrants NOT in the JSON; run once only,
  it doesn't record sends), `--add <email>` (queue one late entrant on Resend + append
  to the JSON).
- `scripts/kickoff-scheduled.json` — the queued Resend message IDs (only way to cancel
  one: `POST https://api.resend.com/emails/{id}/cancel`). Historical after 12:05 ET.
- `scripts/preview-digest.mts` — renders a full digest email locally (real fixtures +
  entrants, fabricated scores, real Claude call) for tone/format tuning.

Run any of them with: `npx tsx --env-file=.env.local scripts/<name>.mts`
(don't `source .env.local` — a value in it breaks zsh parsing).

## Gotchas to remember

- **Vercel does NOT auto-deploy from GitHub** — after pushing, deploy with `vercel --prod`.
- **Two machines, one repo**: start every session with `git pull`.
- `supabase config push` is authoritative: pushing `config.toml` without the `SMTP_PASS`
  secret set in Supabase would disable custom SMTP. Prefer the dashboard for Auth email.
- **Knockout fixtures aren't published by API-Football yet** (only 72 group matches).
  Re-verify `lib/api-football/rounds.ts` `mapRound` once they appear (~late June);
  unmatched rounds flag `needs_attention` and show an amber banner on `/admin`.
- Supabase auth email is capped at 30/hr (`config.toml`) — fine for this pool size.
- Known accepted edge: a match finishing after midnight ET belongs to the prior day's
  recap but the new day's leaderboard movement.
- If the Claude recap call fails, the digest silently falls back to stats-only — a
  `recaps.narrative` that stays null across several polls is worth investigating.

## Likely in-tournament tasks

- Mark entrants paid (`/admin` or a service-role script); the leaderboard shows an
  "Unpaid" tag until then.
- Late entrant joined pre-lock? Add them to the welcome email with
  `send-kickoff.mts --add <email>` (before 12:05 ET) or `--catchup` (after).
- Wrong result from the API? Use the `/admin` override (sticky) + recompute.
- Post-kickoff feature ideas are queued in the plans docs — live provisional points
  was the top candidate; not yet approved to build.
