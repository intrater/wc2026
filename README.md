# World Cup 2026 Fantasy Pool

> **🏆 The tournament is over — this repo is now an archive.** The pool ran June 11 – July 19, 2026 with 27 entrants and came down to a 148–148 photo finish decided on the underdog tiebreaker (congrats, Zach F.). The live site is preserved as a fully static snapshot at **[wc2026.johnintrater.com](https://wc2026.johnintrater.com)** — every page frozen with the final data, no backend left running. The `ARCHIVE_MODE` freeze is part of this codebase (`lib/archive.ts`).

A mobile-first web app to run the annual World Cup pool: draft one team from each of 12 odds-based tiers, picks lock at kickoff and go public, results auto-ingest from API-Football, and a public leaderboard tracks everyone with plain-English point breakdowns.

- **Requirements:** `docs/brainstorms/2026-05-31-world-cup-pool-requirements.md`
- **Plan:** `docs/plans/2026-05-31-001-feat-world-cup-pool-app-plan.md`

## Stack

Next.js (App Router) · Supabase (Postgres + Auth + RLS) · Vercel (hosting + Cron) · API-Football (results feed).

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in values (see below).
3. `npm run dev` → http://localhost:3000

## Environment / accounts needed

This app needs three external accounts. Fill the matching values in `.env.local`:

| Service | What to create | Env vars |
|---------|----------------|----------|
| **Supabase** | A project (free tier OK to start) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **API-Football** | api-sports.io account, **Pro tier (~$19/mo)** — not the free tier | `API_FOOTBALL_KEY` |
| **Vercel** | Project linked to this repo (Pro, for per-minute cron) | env vars + `CRON_SECRET` |
| **Anthropic** | API key for the nightly recap narrative (pennies/day) | `ANTHROPIC_API_KEY` |

`ADMIN_EMAIL` controls who gets admin rights (results override, paid toggle, tier freeze).

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm test` — run the scoring-engine and unit tests (Vitest)
