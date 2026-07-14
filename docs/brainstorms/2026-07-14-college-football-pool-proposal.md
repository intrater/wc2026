# Gridiron '26 — College Football Tier Pool Proposal

**Status:** brainstorm / proposal — not yet committed to building
**Date:** 2026-07-14 (drafted 2026-07-12 from a full wc2026 codebase review + API research)
**Working name:** "Gridiron '26" (placeholder, better ideas welcome)

A college football version of the World Cup pool: draft one team from each
odds-based tier, ride them all season, underdogs pay. Rebuilt for a sport with
no draws, 60-point blowouts, and cupcake schedules.

## The short answer

- **Feasible:** ~70% of the wc2026 app carries over — tier-draft mechanic, pure
  scoring engine, payouts, leaderboard, digest emails, race cards, Monte Carlo
  outlook, admin tools. Rewrite: ingestion layer, seed data, stage enum,
  bracket logic. Estimate: **2–3 focused weekends.**
- **Data:** CollegeFootballData.com (CFBD) — free tier 1,000 calls/mo, full
  live data at $1–5/mo. Versus ~$19/mo for API-Football. ESPN's unofficial API
  free for the live Saturday ticker (display-only, never scored).
- **Scoring:** never score points-on-the-board. Score outcomes,
  opponent-adjusted: wins classed by opponent, tier-gap upset bonuses, and
  (maybe) spread covers for underdog tiers.
- **Scope (decided):** Power 4 + Notre Dame, top 60 by preseason title odds,
  **12 tiers of 5** — the exact WC pool shape, so everyone already knows how
  to play.

## Scoring model

Design principles: (1) football points are cheap, so any "per touchdown" rule
becomes a blowout-watching contest; (2) every good team schedules 2–4
cupcakes, so a flat point-per-win rewards soft scheduling. Fix: make every
point opponent-adjusted.

### Regular season (per game)

| Event | Points | Notes |
|---|---|---|
| Win vs Power 4 / Notre Dame opponent | 2 | The bread and butter |
| Win vs Group of 5 (FBS) opponent | 1 | Half credit |
| Win vs FCS opponent | 0 | Cupcakes score nothing, ever |
| Upset bonus: beat a higher-tier team | +1 per tier gap | Same rule as WC pool; suggest cap at +6/game |
| Underdog cover, tiers 7–12 only | +1 | Cover the closing spread, win or lose — the "goal bonus" analog. See open questions |

### Postseason (round points replace base win points)

| Event | Points |
|---|---|
| Win conference championship game | 3 |
| Lose conference championship game | 1 |
| Make the 12-team CFP (Selection Sunday) | 2 |
| CFP first-round win | 3 |
| CFP quarterfinal win | 5 |
| CFP semifinal win | 7 |
| National championship win | 10 |
| Non-playoff bowl win | 2 |

Top-4 CFP seeds skip the first round — the bye is its own reward, no points.

Considered and dropped: ranked-win bonus (double-counts tier gap),
margin-of-victory bonus (rewards running up the score).

Tiebreakers as in the WC pool: total → underdog points (tiers 7–12) → upset
points.

### Balance check (worked seasons)

- **Tier 1 blue blood**, 12–1, wins conference + natty: 8 P4 wins (16) +
  2 G5 wins (2) + conf title (3) + CFP field (2) + QF/SF/title (22) = **45**
- **Tier 10 overachiever**, 8–4, two upsets, bowl win: 5 P4 wins (10) +
  2 G5 wins (2) + upset of a Tier 3 capped (6) + upset of a Tier 6 (4) +
  6 covers (6) + bowl (2) = **30**

Same shape as the WC pool: top tiers must deliver, but a great underdog pick
closes most of the gap.

## Scope decision

- **SEC only — rejected.** 16 teams is too shallow for a tier draft, and picks
  constantly play each other. Fun as a separate pick'em, wrong shape here.
- **Power 4 + Notre Dame — decided.** 68 teams, draft top 60 by preseason
  title odds → 12 tiers of 5. Books publish odds for all of them.
- **Top 50 overall (incl. G5) — season-two experiment.** Boise-type teams play
  mostly G5-vs-G5 schedules, which muddies win classes and tier math.

## Draft board (first pass, July 12 consensus odds)

Method: rank by national championship futures (blended across Odds Shark +
VegasInsider multi-book board), slice into tiers of 5. The real board gets
built mid-August from a de-vigged multi-book average — same math the app
already runs in `getMatchOdds`. Below tier 9, ordering is honest noise (books
disagree 2–3× on those teams).

| Tier | Teams (consensus title odds) |
|---|---|
| 1 | Notre Dame +550, Ohio State +600, Texas +650, Indiana +750, Oregon +800 |
| 2 | Georgia +850, LSU +1000, Miami +1100, Texas Tech +1800, Texas A&M +1800 |
| 3 | Alabama +2200, Oklahoma +2800, Ole Miss +2800, USC +3000, Michigan +3500 |
| 4 | Florida +4500, Penn State +5000, Tennessee +5500, Utah +6500, BYU +7000 |
| 5 | South Carolina +7000, Clemson +8000, Auburn +8000, Missouri +10000, Iowa +10000 |
| 6 | SMU +12000, Washington +12000, Louisville +12500, Vanderbilt +15000, Florida State +15000 |
| 7 | Georgia Tech +15000, Houston +18000, Virginia +18000, Kansas State +20000, Pittsburgh +20000 |
| 8 | Arizona State +20000, Arizona +25000, Baylor +25000, Illinois +25000, TCU +25000 |
| 9 | Virginia Tech +30000, Nebraska +35000, Kentucky +40000, Mississippi State +40000, Cincinnati +40000 |
| 10 | North Carolina +45000, Duke +50000, Arkansas +50000, Oklahoma State +50000, California +50000 |
| 11 | Iowa State +50000, Wisconsin +50000, Colorado +60000, Kansas +60000, NC State +60000 |
| 12 | Wake Forest +75000, Maryland +75000, UCF +80000, Rutgers +85000, UCLA +85000 |

**Cut to make 60:** Michigan State, Minnesota, Northwestern, Purdue,
West Virginia, Syracuse, Boston College, Stanford.

Board notes: Tier 1 is a Big Ten knife fight (OSU, defending-champ Indiana,
Oregon all play each other). Mix is 16 SEC / 14 B1G / 15 B12 / 14 ACC + ND, so
every entry watches all four conferences.

## Prizes and engagement (five months is long)

**The main game is cumulative and never resets** — season leaderboard from
Week 1 through the natty decides the big money. Segment prizes are side races
layered on top of the same points.

Prize ladder (sketch at 20 entries × $100):

| Prize | Window | Amount |
|---|---|---|
| Champion | Full season | $750 |
| Runner-up | Full season | $350 |
| Regular-season leader | Locks at conf championship weekend (Dec 5) | $250 |
| Underdog king (most tier 7–12 points) | Full season | $200 |
| Monthly pots × 3 (Sep, Oct, Nov) | Points scored within that month | $150 each |

Monthly pot variant if fresh counts feel gimmicky: award checkpoints to the
cumulative leader instead (but the same front-runner tends to sweep all
three), or blend 60/40.

### Wrinkle menu

Passive (fan does nothing but watch — low risk):

- **Upset of the Week** — biggest tier-gap win each Saturday earns owners +2.
  Auto-computed; the Sunday digest headline. Trivial to build.
- **Rivalry Week doubler** — Thanksgiving week all points double. One constant.
- **Monthly pots** — see above. Reuses the Race card.
- **AI power rankings** — Claude-written Sunday digest with title-odds
  movement and "who to root for" per entry. Recap pipeline already exists.

Active (fan owes the pool attention — engagement lever but complexity risk):

- **The Captain** — name one of your 12 each week for double points; carry
  over if you forget. Medium build.
- **Trade Deadline** — after Week 6, swap one team for an undrafted same-tier
  team; banked points stay. Medium build; possible mid-season surprise
  announcement if engagement dips.
- **Clean Sweep** — all your teams playing that week win (min 8): +3. Trivial
  but forgettable.

### Casual-fan evaluation (the "keep it simple" pass)

Role-played a casual fan (watches most Saturdays, never bet a spread): core
game is exactly right — one fun draft night in August, zero homework after.
The rulebook is ~40% too big. Findings:

- **Cover bonus is the #1 confusion risk** ("I got a point for losing?").
  Keep only if the app shows it live ("Duke +13.5 — covering ✓"); otherwise
  use the fallback: +1 per road P4 win for tiers 7–12.
- **The Captain is homework wearing a fun hat** — demote to season two.
- **FCS zero-point wins need explicit score-line labels** ("FCS opponent —
  doesn't count") or people will think the app is broken.
- Wrinkles split cleanly into passive (pure win for casual fans) and active
  (risk). Launch passive-only.

**Recommended season-one package:** 3-line core scoring + tier-gap upsets +
postseason ladder + monthly pots + Upset of the Week + Rivalry Week doubler +
AI digest. Drawer for season two: Captain, Trade Deadline, Clean Sweep,
possibly the cover bonus.

## Data & APIs

| Source | Cost | Role |
|---|---|---|
| CollegeFootballData.com (CFBD) | Free 1k calls/mo; $1/mo live scoreboard; $5/mo play-by-play | **System of record**: games/scores, closing betting lines, FBS/FCS + conference classification, AP rankings, preseason SP+ |
| ESPN unofficial API (`site.api.espn.com/.../college-football/scoreboard?limit=100&groups=80`) | Free, no key | Live Saturday ticker, display-only, never scored (same pattern as `live_*` columns) |
| API-Football (current) | ~$19/mo | Retires with the WC pool |

Budget check: weekly sport → poll CFBD every 15 min on game days + nightly
sweep ≈ 250 calls/mo, inside the free tier; $5 tier for headroom.

2026 CFP format: 12 teams, straight-seeded by committee ranking, top 4 get
byes, auto-bids for the four P4 champions + highest G6 + Notre Dame if top 12.

## Calendar

- **Mid-August:** tiers published from de-vigged preseason odds; picks open
- **Sat Aug 29:** Week 1 — picks lock, go public (Week 0 games excluded)
- **Sep–Nov:** 13 regular-season weeks; Sunday-morning digest
- **Sat Dec 5:** conference championships — regular-season prize locks
- **Sun Dec 6:** Selection Sunday — CFP field bonuses, bracket published
- **Dec 18–Jan 1:** bowls + CFP first round/quarterfinals
- **Mid-Jan 2027:** semis + national championship — pool champion crowned

## Build plan (what changes in the code)

Carries over nearly untouched: pure recompute engine + constants-file pattern,
tier-draft picks UI and lock flow, payouts math, leaderboard/score breakdowns,
Resend digests, AI recap, Monte Carlo outlook framework, nightly backup,
integrity audit, admin overrides, phase state machine.

Gets rewritten:

- `lib/api-football/` → `lib/cfbd/` — new client + ingest; week/seasonType
  mapper replaces the round-string parser
- Seed data — 60 teams with logos + odds instead of 48 flags
- Stage enum — `regular / conf_champ / bowl / cfp_r1 / cfp_qf / cfp_sf /
  cfp_final`
- Group standings → conference records + CFP field tracking (simpler: no
  best-thirds, no draws)
- Bracket simulator — 12-team seeded playoff (easier than the WC 48-team
  bracket)
- Cron cadence — every-3-min becomes Saturday-aware polling

## Open questions for the group

1. Entry fee and prize split — the seven-prize ladder assumes $100 entries
2. Cover bonus: keep (app-rendered), or fallback to road-win bonus?
3. Upset cap at +6/game, or let a 12-over-1 miracle pay the full +11?
4. Multiple entries per person?
5. Name

## References

- Shareable proposal artifact: https://claude.ai/code/artifact/a2fdd791-91e2-4e39-9b2f-782268ac4b21
- CFBD API tiers: https://collegefootballdata.com/api-tiers
- CFBD free key: https://collegefootballdata.com/key
- ESPN hidden API docs: https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b
- July odds sources: https://www.oddsshark.com/ncaaf/national-championship-odds ,
  https://www.vegasinsider.com/college-football/odds/futures/
- 2026 CFP format: https://www.ncaa.com/news/football/article/2026-02-03/how-college-football-playoff-works-schedule-selections-rankings-byes-and-more
