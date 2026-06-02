# Handoff — continuing on another machine

Everything is on `main` and live in production. Use this to pick up from a fresh
Claude Code session (CLI on another machine, or the web).

## Live resources
- **App (prod):** https://wc2026-pool-psi.vercel.app
- **GitHub:** https://github.com/intrater/wc2026 (`main` is current)
- **Vercel project:** `wc2026-pool` · **Supabase project ref:** `qqdbhuyuoeetnulaxolv`
- **Plan + status:** `docs/plans/2026-05-31-001-feat-world-cup-pool-app-plan.md` (Section 0 = live status)

## Set up the new machine (~2 min)
Secrets live in `.env.local` (gitignored — NOT in the repo) and in Vercel. To restore:
```bash
git clone https://github.com/intrater/wc2026 && cd wc2026
npm install
npm i -g vercel
vercel login && vercel link      # pick the wc2026-pool project
vercel env pull .env.local        # rebuilds .env.local from Vercel's encrypted env
gh auth login                     # for PRs / git over https
```
Then in Claude Code, to continue infra tasks, re-authorize the **Supabase MCP** when prompted
(OAuth). Note: the web/cloud sandbox may not have the Vercel/Supabase connectors — deploys,
DB writes, and email tests are smoothest from a machine with the CLIs logged in.

## Verify the setup works
```bash
npm run build && npx vitest run     # should compile + 33 tests pass
```

## Done so far (today)
- API-Football ingest fixed + verified live (48/48 teams, 72 group fixtures).
- Magic-link auth fixed (PKCE `code` flow) — verified end-to-end in prod.
- **Gmail SMTP + rate limit fixed** (was the launch blocker; built-in email only reached
  team members + 2/hr cap). Now custom SMTP, 30/hr. Pinned in `supabase/config.toml`.
- UI punch-list: landing rules + state-aware CTA, prize pool removed, pick read-only/edit
  states + bottom completion, lock countdown, state-aware nav, "your matches" first, share CTA,
  join-form placeholders.
- Lock time set: **2026-06-11 12:00 ET** (`settings.lock_at`).

## Remaining before launch (June 11)
1. **Freeze the tiers** (admin `/admin`, ⚠️ IRREVERSIBLE) — review the 12×4 board first.
   Drives all upset/goal math. Don't freeze until the board is final.
2. **Mock a tournament-in-progress** to preview live scoring/leaderboard views, then clear it
   (use the admin result-override path + recompute; service-role DB access needed).
3. Any new items from another live pass.

## Gotchas to remember
- `supabase config push` is authoritative: pushing `config.toml` without the `SMTP_PASS`
  secret set in Supabase would disable custom SMTP again. Prefer the dashboard for Auth email.
- Vercel is NOT auto-deploying from GitHub — deploy with `vercel --prod` after merging.
- Knockout fixtures aren't published by API-Football yet (only 72 group matches). Re-verify
  `mapRound` against live data once they appear (~late June); unmatched rounds show as an
  amber banner on `/admin`.
