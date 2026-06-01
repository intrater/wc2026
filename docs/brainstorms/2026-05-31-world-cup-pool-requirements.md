# World Cup 2026 Fantasy Pool — Requirements

**Date:** 2026-05-31
**Status:** Requirements (ready for planning)
**Author:** John Intrater (with Claude)
**Target:** Live and collecting picks before the tournament opener, **June 11, 2026**

---

## 1. Summary

A mobile-first web app to run John's annual World Cup fantasy pool end-to-end, replacing the 2022 spreadsheet + Google Form setup. Players draft a roster of teams across odds-based tiers, picks lock at the tournament opener and become public, scores update automatically from a live results feed, and a public leaderboard tracks everyone through the tournament.

The 2022 version worked but had two pain points this build fixes: (1) **scores bunched together** because everyone picked the same favorites, and (2) **everything was manual** — picks via Google Form, scoring by hand in a spreadsheet. The 2026 design deliberately spreads picks out and automates scoring.

It also adapts to the new 2026 tournament: **48 teams, 12 groups, and a new Round of 32** (the 2022 format was 32 teams / 8 groups / Round of 16).

---

## 2. Goals & Non-Goals

### Goals
- Make it **fun** — maximize rooting interest, including for weak teams in otherwise-meaningless games.
- **Spread the scores** — pick diversity so standings don't bunch up and ties are rare.
- **Automate scoring** — results flow in from a data feed; no manual spreadsheet math.
- **Dead-simple UX** around the three real usage moments (see §7).
- Ship a **polished** experience before June 11, triaging hard to hit the date.

### Non-Goals (explicitly out of scope for 2026)
- Real payment integration (Stripe etc.) — payments stay manual via Venmo.
- Pre-game "what-if" / bracket projections — *anything before a game is noise*.
- Broadcast/marketing email notifications (transactional email for pick-edit links only).
- Public/stranger-facing scale, heavy auth, or abuse protection — this is a ~25-person trusted friend group.
- Per-tier scaling of goal values, or other mechanics that add mental math.

---

## 3. Players, Scale & Money

- **Audience:** John's friend group, **~25 entrants or fewer**. Trust-based, low security needs.
- **Entry fee:** **$100 per entry**, paid manually via **Venmo to @john-intrater** (same as 2022).
- **Payment tracking:** Admin (John) toggles a **paid / unpaid** status per entrant inside the app. No payment integration.
- **Admin:** John is the **sole admin** (toggle paid status, override results).

---

## 4. Tier Structure & Picks

### The format
- All **48 teams** are split into **12 tiers of 4 teams each**, ranked by betting odds to win the tournament.
- Each entrant **picks exactly one team from each of the 12 tiers** → a **12-team roster**.
- The one-pick-per-tier constraint is the core fairness mechanic: you **cannot** stack multiple favorites, and the field can't all pile onto the same team. This forces every roster to span strong → weak and keeps scores spread out.
- Combinations are effectively unlimited (4¹² ≈ 16.7M), so identical entries can't happen.

### The bottom tiers are intentional "lottery" picks
- The lowest tiers (roughly 9–12) are teams with near-identical, hopeless odds. Treating them as pure lottery is **a feature, not a bug**: it guarantees every dreadful team is owned by someone, so even minnow-vs-minnow group games have someone rooting hard. This is a primary source of fun.

### Tiers are built from live odds, just before picks open
- The tier table below is a **snapshot as of 2026-05-31**. Odds will move before June 11.
- **The app will re-pull current odds and rebuild the 12 tiers right before the pick window opens**, then freeze them for the tournament. Structure stays 12×4; only the team placements refresh.

### Snapshot tier board (2026-05-31, championship odds)

| Tier | Label | Teams |
|------|-------|-------|
| 1 | The elite | Spain (+475), France (+500), England (+650), Brazil (+850) |
| 2 | Contenders | Argentina (+900), Portugal (10-1), Germany (14-1), Netherlands (22-1) |
| 3 | Dark horses | Belgium (35-1), Norway (35-1), Colombia (40-1), Uruguay (50-1) |
| 4 | Solid | Morocco (50-1), USA (60-1), Switzerland (65-1), Japan (65-1) |
| 5 | Outsiders | Mexico (80-1), Croatia (80-1), Ecuador (80-1), Senegal (90-1) |
| 6 | Longshots | Turkey (100-1), Sweden (100-1), Austria (150-1), Canada (200-1) |
| 7 | Deep longshots | Scotland (200-1), Ivory Coast (250-1), Czechia (250-1), Paraguay (300-1) |
| 8 | Faint hope | Egypt (300-1), Ghana (300-1), Algeria (350-1), South Korea (400-1) |
| 9 | Minnows | Bosnia (500-1), Tunisia (500-1), Australia (600-1), Iran (700-1) |
| 10 | Lottery | Congo DR (1000-1), Saudi Arabia (1000-1), South Africa (1000-1), Panama (1000-1) |
| 11 | Lottery | Cape Verde (1000-1), Qatar (1500-1), Uzbekistan (1500-1), New Zealand (1500-1) |
| 12 | Pure lottery | Iraq (1500-1), Jordan (2500-1), Curaçao (2500-1), Haiti (2500-1) |

---

## 5. Scoring System

The design splits how favorites vs. underdogs earn points, creating two different kinds of rooting interest:
- **Favorites (tiers 1–6):** earn through match results + deep tournament runs.
- **Underdogs (tiers 7–12):** earn through results too, **plus goals scored and upset bonuses**.

All point values below are **starting dials — tunable before launch**.

### Group stage (per team)
- **Draw:** 1 point
- **Win:** 2 points
- **Win your group:** +3 points (bonus)
- **Advance to the knockouts but don't win the group:** +1 point

### Knockout rounds (escalating, rewards deep runs)
2026 adds a Round of 32 before the Round of 16. Per knockout **win**:
- **Round of 32:** 2 points
- **Round of 16:** 3 points
- **Quarterfinal:** 5 points
- **Semifinal:** 7 points
- **Final (championship win):** 10 points

### Goal bonus (underdogs only — tiers 7–12)
- **+1 point per goal scored**, for any team in **tiers 7–12 only** (the bottom half).
- Flat value — **no per-tier scaling** (kept simple on purpose).
- Rescues lottery picks from being dead weight: even a team that loses every game gives you points (and a reason to cheer) when it scores.
- Tiers 1–6 earn purely through results — keeps goal-fests from inflating the favorites.

### Upset bonus (all teams)
- When a team **beats a higher-tier team**: **+1 point per tier of the gap**.
- When a team **draws a higher-tier team**: **+0.5 point per tier of the gap**.
- Applies in **both group and knockout** games.
- Example: a Tier 10 team beating a Tier 3 team → 7-tier gap → +7 points.
- Self-balancing: favorites beating minnows earn nothing extra (expected result).

### Tiebreaker
- Carried from 2022 in spirit: **most points from the lower (underdog) tiers**. Exact cutoff to be finalized in planning (e.g., tiers 7–12, or the bottom N picks).

---

## 6. Player Flow & Access

- **Join + submit:** Anyone with the shared link enters **name + email**, then makes their 12 picks in-app. No passwords.
- **Editing picks:** Players edit via a **magic link emailed to them** (Supabase Auth), so only they can change their own roster. Transactional email only — no broadcast notifications.
- **Pick visibility:** Picks are **hidden from others until kickoff**. At the tournament opener (pick lock), everything reveals at once.
- **After lock:** The app is **fully public and equal** — one leaderboard, all rosters and scores visible to everyone. No special access.
- **Lock timing:** Picks lock at the **first match of the tournament (June 11, 2026)**.

---

## 7. The Three Usage Moments (UX backbone)

The entire UX is designed around three real moments. The app effectively **changes shape at kickoff**: pick mode → tracking mode.

### Moment 1 — Adding your entry (once, before kickoff)
- The 12-tier pick flow. Must be effortless on a phone: go tier by tier, tap one team in each, submit.
- This is the one-time onramp — first impressions matter; keep it frictionless.

### Moment 2 — During a game (quick glance, many times)
- For any match, see in ~3 seconds: **do I have a team in this match, who did I pick, and does a goal bonus apply?**
- Example: "You have **Senegal** here (your Tier 5 pick)." Plus a flag for lottery teams: "**Goals score you points.**"
- **No pre-game projections or "what you should want"** — that's noise. Just identify the stake.

### Moment 3 — After a game (the recurring loop, the "home base")
- **Live standings / leaderboard** is the default landing screen after kickoff — people open it dozens of times across the month.
- See your points update with a **plain-English breakdown** of how each team earned: e.g., "**+4 from Senegal** — 2 (win) + 2 (two goals)."
- **Browse what everyone else picked** — a fun, browseable "who picked what" view (snooping on rivals' rosters is half the fun), not a data dump.

### Supporting views
- **Per-team detail:** tap any team to see how its points were earned across the tournament (like the 2022 master grid).
- **Match schedule / results feed:** live fixtures and results from the data feed.

---

## 8. Results & Scoring Engine

- **Source (decided):** **API-Football** (api-sports.io), **Pro tier ~$19/mo**, subscribed **directly** (not via RapidAPI, to avoid overage charges). Chosen after evaluating 6+ providers (see §8.1).
  - Confirmed (May 2026) to already have 2026 data live: all 104 fixtures (league ID `1`, season `2026`), the 48-team / 12-group field, per-match goals + events, group standings, and the "Round of 32" stage label.
  - Integration: REST/JSON, GET-only, single `x-apisports-key` header. Thin `fetch` wrapper — no SDK. A scheduled job (Supabase) polls for updates; live data refreshes ~every 15s on their side.
- **Fallback provider:** **SportMonks** (~$31/mo) if API-Football has issues. Also publishes WC2026 fantasy-pool integration guides worth referencing.
- **Manual override (required safety net):** Admin can edit/confirm any result in-app. A live API can post a wrong or delayed score; the override guarantees the leaderboard is never stuck or wrong on finals night.
- **Recompute:** Entering/correcting a result recomputes all affected entrants' points and the standings.
- **Custom logic required (any provider):** The 8-best-third-place advancement to the Round of 32 must be computed in our own code from group standings — no API provides it cleanly.

### 8.1 API selection summary

| API | WC2026 status | Reliability | Price | Verdict |
|-----|---------------|-------------|-------|---------|
| **API-Football** | Confirmed live now (104 fixtures queryable, R32 label present, goals/standings enabled) | Public status page, 100% API uptime over 3mo | $19/mo Pro | **Selected** |
| SportMonks | Confirmed, full; best docs/fantasy guides | Self-reported 99.99% | ~$31/mo | Fallback |
| football-data.org | Not confirmed for 2026; R32 untested; goals gated; ~70-80% fixture capture | Single-operator, no SLA | €12-29/mo | Rejected (risk) |
| Sportradar / Entity Sport | Full | Enterprise | €10k+/yr / $450/mo | Rejected (price) |
| TheSportsDB | Shallow (numeric round IDs, 2-min delay, crowd-sourced) | Low | $9/mo | Rejected (accuracy) |

- **Do NOT use API-Football's free tier in production** (100 req/day — a live match day exceeds it). Pro tier uses ~10% of quota on peak days.

---

## 9. Payouts

- Pot = **$100 × number of paid entries**, **auto-scaled** by the app (no manual math as entrants join).
- **Three prize categories:**
  - **Overall champion** — most total points at tournament's end (headline prize).
  - **Overall runner-up** — 2nd on total points.
  - **Group-stage leader** — most points during group play only (keeps everyone engaged in the busy early weeks, like 2022's prize).
- **Proposed split:** ~**60% / 25% / 15%** — to be confirmed in planning.

---

## 10. Tech Stack

- **Frontend/app:** Next.js, deployed on **Vercel** (John has a paid account).
- **Backend/data:** **Supabase** — Postgres (data), Auth (magic-link pick editing), scheduled function (poll results API).
- **Hosting/admin:** John's existing Vercel + Supabase accounts. Sole admin.

---

## 11. Open Items for Planning

These are deferred to `/ce-plan`, not unresolved product questions:

1. ~~Choose & verify the data API~~ — **DONE: API-Football selected** (see §8). Remaining: subscribe to Pro tier, make a live confirming `GET /fixtures?league=1&season=2026` call with a real key, and build the third-place advancement logic.
2. **Odds source for tier-building** — where the app pulls championship odds to rebuild the 12 tiers right before picks open (and the admin step to freeze them).
3. **Final scoring dials** — confirm/tune all point values (knockout ladder, goal bonus = 1, upset multipliers).
4. **Tiebreaker definition** — exact tier cutoff for "underdog points."
5. **Payout percentages** — confirm 60/25/15 and rounding rules.
6. **Lock mechanics** — exact lock timestamp, and handling of any unpaid entries at lock.
7. **"Win your group" / "advance" detection** under the 2026 format (top 2 of each group + best third-placed teams advance to the Round of 32).
8. **Edge cases:** owning both teams in a match (show net stake clearly), knockout penalty-shootout wins counting as wins, abandoned/forfeited matches.

---

## 12. Dependencies & Assumptions

- **Assumption:** A football data API with full 2026 coverage (fixtures, results, goals, standings) is available on an affordable tier by early June. *Risk: new tournament format may lag in free tiers — mitigated by the manual override.*
- **Assumption:** The 48-team field and group draw are final (draw was December 2025), so tiers can be built from a known team list.
- **Assumption:** ~25 entrants, trusted group — no need for hardened auth or anti-abuse.
- **Dependency:** John's Vercel + Supabase accounts.
- **Timeline risk:** ~11 days to the opener. Tier-building, the pick flow, and the leaderboard are the must-haves for launch; the live data feed has the manual-override fallback if it's not ready in time.
