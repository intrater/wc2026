# Handoff — continuing on another machine

Everything is on `main` and live in production at **https://wc2026.johnintrater.com**.
Use this to pick up from a fresh Claude Code session. Good first prompt:
*"Read HANDOFF.md, then review the codebase to get fully up to speed."*

## Where things stand (updated 2026-06-17, mid-group-stage)

- **The pool is live and in tournament mode**: 27 submitted entries, picks locked
  **2026-06-11 12:00 ET**, group stage in progress. Site is leaderboard-home, rosters public,
  picks frozen (`lib/state/phase.ts`, RLS `0004_post_lock_privacy.sql`).
- **Tournament mode** (plan: `docs/plans/2026-06-07-001-feat-tournament-mode-plan.md`):
  match calendar with live scores, daily leaderboard movement, nightly Claude recap, opt-in
  7am ET digest email.
- **Chance-to-win "outlook" rating is the major post-launch feature** (added 2026-06-17) —
  has its own section below. Plan: `docs/plans/2026-06-17-001-feat-chance-to-win-plan.md`.
- **Other post-launch features shipped** (all on `main`, see git log): per-team scorelines on
  the roster page, match venues, viewer-local match times, leaderboard "games played /
  pts-per-game", a "Today's Matches" home card, the tier list turned into an ownership board
  (`/tiers`, who-picked-each-team), and tier + favorite (live-odds win %) on match cards and
  the match detail view.

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
npm run build && npx vitest run     # should compile + ~134 tests pass
```

## How the machine runs itself (read before touching prod)

- **Vercel cron hits `/api/poll` every 3 min** (`vercel.json`), authenticated by
  `CRON_SECRET`. Stage order is load-bearing: daily standings snapshot → API-Football
  ingest + full score recompute → recap generation (Claude, once the day's last match
  resolves) → digest email blast (first poll after 7am ET, atomic claim so overlapping
  crons can't double-send). See `app/api/poll/route.ts`.
- **A SECOND Vercel cron hits `/api/outlook` every 10 min** (`vercel.json`, also
  `CRON_SECRET`) — the chance-to-win recompute (incl. live-odds fetch), deliberately kept off
  the load-bearing 3-min poll. See the chance-to-win section below.
- **Scoring is a pure, idempotent recompute** (`lib/scoring/engine.ts`) — full replace of
  `scores` + `score_lines` every ingest. Live scores are display-only columns; only
  terminal results feed scoring.
- **All email goes through Resend SMTP** (`smtp.resend.com`, from
  `pool@wc2026.johnintrater.com`): Supabase auth magic links, pick receipts, the daily
  digest, and the kickoff blast. There is no Gmail anywhere (older comments saying
  otherwise are stale).
- **Admin** (`/admin`, gated by `ADMIN_EMAIL`): toggle paid, override results
  (`manual_override` is sticky — ingest skips those fixtures), manual ingest, lock/freeze.

## Chance-to-win "outlook" rating (added 2026-06-17 — read before touching it)

Per-entry 🔥/💪/🎲/🌱/💀 label for **P(finishing 1st overall)**, on each leaderboard row +
a rationale card on the entry page + explainer at `/how-its-built#chance-to-win`. All logic
lives in `lib/outlook/*` (pure, unit-tested) and runs from `app/api/outlook/route.ts`.

- **Two layers.** Exact (`bounds.ts`): conservative ceiling/floor arithmetic → 💀 No-shot /
  🔒 Clinched. Over-estimates by design, so it's *never wrong*, only late (mid-group nobody is
  eliminated yet → everyone "in contention"; 💀/🔒 start firing as groups finish). Model
  (`sim/*`): a 10k-run Monte Carlo finishes the tournament from current results and scores
  ALL entries via the same pure `lib/scoring/engine.ts` per simulated world (so shared-team
  correlation is free), counting 1st-place finishes → the 5 buckets. Exact overrides the model.
- **Strength** (`strength.ts`): seeded from championship odds (`tiers.odds`, parsed by
  `odds.ts`), repriced by results (Elo), and **overridden by live per-match odds** for
  imminent games. Live odds are fetched by the cron (`oddsRefresh.ts` → `getMatchOdds` in
  `lib/api-football/client.ts`), cached on `matches.odds_{home,draw,away}` (migration 0010),
  throttled (≤20 fixtures/run, 3h-stale window, group fixtures within ~4 days only).
- **Cache table** `entry_outlook` (migration 0009, public-read like `recaps`). Recompute is
  cheap (~1s incl. odds fetch); the cron runs it unconditionally every 10 min.
- **Tunables** (in-module constants): `N_SIMS` + `SEED` (`run.ts`), bucket cut-points
  (`bucket.ts`), `ELO_K` + `RATING_SCALE` (`strength.ts`), `MAX_GOALS_PER_MATCH` (`bounds.ts`).
  Fixed RNG seed = no run-to-run jitter.
- **Known approximations / parked:** the **live** knockout sim (`lib/outlook/sim/bracket.ts`)
  still uses **strength-ordered advancement, not the real FIFA bracket**. The real bracket is
  now **encoded and ready but DORMANT** in `lib/outlook/sim/bracket2026.ts` (imported by
  nothing; see "Knockout flip-the-switch" below). The exact-layer knockout ceiling slightly
  over-counts (safe). Both flagged in the plan doc; revisit when the knockouts start.

## Knockout flip-the-switch (runbook — say "flip the switch for the knockouts")

When the group stage ends, this moves the chance-to-win sim from its strength-reseed
approximation to the **real bracket**. The structure is encoded, tested, and
**already validated against live fixtures** in `lib/outlook/sim/bracket2026.ts` (read its
header). The two functions the flip needs — `assignR32ToSlots()` and `playFixedBracket()` —
also already exist and are tested. Nothing imports the module yet, so until step 3 the live
pool is untouched. **The only live files that change are `loadInput.ts` and `worlds.ts`.**

**Validation status (2026-06-26):** the first 4 published R32 fixtures (incl. a third-place
slot, Bosnia 3rd-B → match 81) all matched `bracket2026.ts`. Transcription is confirmed.

**Preconditions:** all 72 group matches terminal (groups complete) AND all 16 R32 fixtures
populated with real teams. API-Football fills each R32 tie in as both teams clinch, so the
set completes shortly after the last group games. As of 2026-06-26: 60/72 group done, 4/16
R32 published. Do nothing until both gates clear.

1. **Verify `mapRound` for the new rounds.** R32 already confirmed (label `"Round of 32"`,
   `needs_attention: 0`). When R16/QF/SF/final/3rd-place publish, confirm `rounds.ts`
   `mapRound` maps each; unmapped rounds set `needs_attention` → `/admin` banner + alert email.
2. **Validate against the real fixtures.** Build `posOf` (team id → {group, pos}) from the
   final standings via `orderedGroupStandings`, then `assignR32ToSlots(realR32, posOf)`.
   **`unmatched` MUST be `[]`** — that both confirms the bracket and produces the ordered ties.
   Third-place slotting falls out of the real fixtures here; FIFA's 495-row table is NOT needed.
3. **Flip the sim (the only live change).** In `loadInput.ts` build the R32 ties (step 2) and
   add them to `SimInput`; in `lib/outlook/sim/worlds.ts`, once groups are complete, call
   `playFixedBracket(ties, ratings, rng)` instead of `simulateBracket(qualifiers, …)`. Keep
   `bracket.ts` until this is shipped (it's the fallback while groups are still in progress).
4. **Prove + ship.** `npx vitest run` + `npm run build`, then `vercel --prod`, then trigger
   `/api/outlook` (Bearer `CRON_SECRET`) and confirm it recomputes with no `/admin`
   needs_attention and no integrity-alert email. The standings-integrity monitor
   (`lib/monitoring/integrity.ts` + `lib/scoring/audit.ts`, runs every poll, emails
   `ADMIN_EMAIL` on any drift) watches scoring throughout.

## Untracked scripts (this machine only — copy manually, do NOT commit)

`scripts/` holds files that are deliberately untracked because the repo is public
and `kickoff-scheduled.json` contains entrant email addresses (only `scripts/seed.ts` is
tracked; everything below — including `send-digest-sample.mts` — is local-only):

- `scripts/send-kickoff.mts` — kickoff blast tool. Modes: `--test`, `--send`,
  `--schedule`, `--catchup` (immediate send to entrants NOT in the JSON; run once only,
  it doesn't record sends), `--add <email>` (queue one late entrant on Resend + append
  to the JSON).
- `scripts/kickoff-scheduled.json` — the queued Resend message IDs (only way to cancel
  one: `POST https://api.resend.com/emails/{id}/cancel`). Historical after 12:05 ET.
- `scripts/preview-digest.mts` — renders a full digest email locally (real fixtures +
  entrants, fabricated scores, real Claude call) for tone/format tuning.
- `scripts/send-digest-sample.mts` — one-time tool (2026-06-12) that emailed the first digest
  as a sample to non-subscribers. Historical; no embedded secrets, kept untracked anyway.

Run any of them with: `npx tsx --env-file=.env.local scripts/<name>.mts`
(don't `source .env.local` — a value in it breaks zsh parsing).

## Gotchas to remember

- **Vercel does NOT auto-deploy from GitHub** — after pushing, deploy with `vercel --prod`.
- **Two machines, one repo**: start every session with `git pull`.
- **⚠️ NEVER run `supabase config push`.** Local `config.toml` carries DEV values
  (`site_url = http://127.0.0.1:3000`); a push would overwrite prod's redirect URL and **break
  every magic-link login** — and would also disable custom SMTP without `SMTP_PASS` set. Make
  Auth/config changes in the Supabase **dashboard** or via the **Management API** (its personal
  access token is in the macOS keychain — service `Supabase CLI`, base64-wrapped; that's how
  `jwt_expiry` and refresh-token rotation were changed).
- **DB migrations** apply with `supabase db push` (NOT config push). History is reconciled
  through **0010**; 0006/0007 had been applied out-of-band and were `supabase migration repair
  --status applied` on 2026-06-15. Latest file = `0010_match_odds.sql`; next new one = `0011_*`.
- **Auth sessions:** `jwt_expiry = 1 week` (the max) and **refresh-token rotation is OFF**
  (disabled 2026-06-16 via Management API, mirrored in `config.toml`). Rotation races were
  logging people out before a week was up; off → a session lasts until cookies clear. Don't
  re-enable rotation unless you want the "I got logged out again" complaints back.
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
- **When the knockout bracket is drawn (~late June):** follow the **"Knockout flip-the-switch"**
  runbook above (verify `mapRound`, validate the encoded bracket against the real fixtures, then
  rewire the sim). The real bracket is already encoded + tested in `lib/outlook/sim/bracket2026.ts`.
- Chance-to-win has small parked tweaks if wanted (all optional, none blocking) — see its
  section + the plan doc's open-decisions list.
