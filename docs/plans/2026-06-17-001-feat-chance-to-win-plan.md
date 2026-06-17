---
title: "Chance to Win It All — per-entry outlook rating"
type: feat
date: 2026-06-17
---

# ✨ Chance to Win It All — per-entry outlook rating

## Section 0 — Status & Summary

**Status:** PLANNED. Revised 2026-06-17 after a 3-reviewer plan review (DHH / Kieran / simplicity).
Scope cut to **Lean + Live Odds**; exact-layer correctness bugs fixed; module boundaries drawn.

**One-liner:** A per-entry 🔥→💀 emoji + label on every leaderboard row showing each entrant's
chance to **finish 1st overall**, from a Monte Carlo simulation of the rest of the tournament that
reuses the existing pure scoring engine — sharpened by **live betting odds** for imminent games —
with a plain-English rationale and a transparent methodology explainer on the entry page.

**Locked decisions:**
- Rating = **P(finish 1st overall on total points)** only. Group-stage side-prizes are out of scope.
  This feature does **not** read `settings.payout_split` at all.
- Display = emoji + label on each leaderboard row; rationale + methodology on the entry page.
- **Monte Carlo simulator is IN** (it produces the 5-bucket gradient).
- **Live per-match odds are IN** as a sharpening override for imminent fixtures.

**Cut after review (gold-plating that's invisible behind a bucketed emoji, or high-risk):**
- ❌ Hand-transcribed FIFA Annex-C bracket (495 combos) → **strength-ordered advancement** instead,
  and use the **real** bracket the moment the provider publishes it.
- ❌ Calibrated bivariate Poisson goals model → **sample W/D/L + a plausible scoreline** for the bonus.
- ❌ Heavy Elo machinery → a **light** strength model; live odds do the near-term repricing.
- ❌ Hysteresis and `input_fingerprint` → results-gating + a fixed seed already prevent flicker.

**Build order:** Phase 1 (exact, model-free 💀/🔒 labels — bulletproof) → Phase 2 (lean Monte Carlo
gradient + live odds).

---

## 1. Overview & motivation

Total points are a misleading sole signal — an entrant can lead because their teams played earlier,
not because they're actually positioned to win. This feature answers *"can they still win the pool?"*
with a modeled, continuously-updated **outlook**: simulate the rest of the tournament thousands of
times, score every entry with our real scoring engine on each simulated world, and count how often
each entry finishes 1st. Because entries share teams, we simulate one *world* and score everyone on
it, so correlation is handled for free. Output is bucketed into 5 rough labels — we never show a
false-precise percentage.

## 2. What "winning" means (scope)

Rates **P(champion = finish 1st overall on total points)** only — per explicit product decision. The
pool's two group-stage prizes are a separate, mostly-decided race we don't surface here. This feature
must **not** read `settings.payout_split` (there's a latent 3-vs-4-key mismatch between
`0001_schema.sql:32` and `lib/db/types.ts` — a separate fix, unrelated to this work).

## 3. Module map (drawn up front for testability — Kieran)

```
lib/outlook/
  odds.ts          parse American "+475" + fractional "10-1" → implied prob; de-vig a set; de-vig live 1X2. PURE.
  strength.ts      outright-odds → rating prior; light results adjustment; ratingDiff → {pHome,pDraw,pAway};
                   merge live-odds override. PURE. (single source of truth for match probabilities)
  loadInput.ts     loadOutlookInput(admin): terminal results + REMAINING fixtures/stages + field
                   (submitted entries + picks) + strength inputs. (loadScoringInput only returns terminal — insufficient.)
  bounds.ts        exact ceiling/floor → 💀 / 🔒. PURE. (the credibility anchor — §5)
  sim/match.ts     ({pHome,pDraw,pAway}, rng) → engine-shaped scoreline + decidedBy (incl. knockout forced winner). PURE.
  sim/advance.ts   strength-ordered knockout advancement; use REAL bracket once published. PURE.
  sim/run.ts       one world: real terminal + simulated future → recompute() → rank → 1st-place credit. PURE (rng injected).
  bucket.ts        winShare + fair-share(1/N) → bucket. PURE.
  rationale.ts     plain-English sentence from one cached run. PURE.
  run.ts           orchestration (mirrors lib/scoring/persist.ts runRecompute): load → N worlds → bucket → persist.
  persist.ts       write entry_outlook (full replace, service-role).
```

Naming: the Elo-ish predictor is `strengthRating` everywhere — never `strength` near the engine's
frozen `tier` code, which §6 keeps strictly separate. **The seeded RNG is threaded as an argument**
from `run.ts` down into `sim/*` — never module-global — so determinism is real, not luck.

## 4. Reuse anchor

`lib/scoring/engine.ts` is a pure function of (matches, tiers, picks) — `recompute(ScoringInput)`,
`computeGroupPlacement`, `compareForLeaderboard`. A simulation calls `recompute` repeatedly with a
synthesized `ScoringMatch[]` (real terminal matches + simulated future ones). "1st place" is decided
with the exported `compareForLeaderboard` / `rankWithTies` (`lib/standings/snapshot.ts`) — **never
re-derived** — so the sim's notion of 1st can't drift from the live board. Speed: the engine already
memoizes per-team lines (`engine.ts:278`); per world we compute ~48 teams' points once, then each
entry total = sum of its 12 picks.

## 5. The exact layer (Phase 1 — no model, "never wrong")

Pure arithmetic in `bounds.ts`. It **overrides** the model at the extremes and is **conservative by
construction** — it may fire *late*, but it is never wrong (the only acceptable behavior when you're
telling a real person they're dead or have clinched).

- **One conservative ceiling per entry** = sum over the entry's still-alive teams of each team's
  *maximum* remaining points, assuming (over-estimates, all safe): the team wins every match it could
  still play all the way to the final, earns the max group-placement bonus, the max upset bonus, and
  scores up to a **named `MAX_GOALS_PER_MATCH` cap** each match (makes goal bonus finite). Collisions
  (two of your teams meeting) are *ignored* — inflating the ceiling, which is safe in both directions.
- **💀 No shot:** `entry.ceilingTotal < leader.currentTotal` (strict). Over-estimating the ceiling
  guarantees we never falsely eliminate. Equal totals → *not* eliminated (could win on tiebreakers).
- **🔒 Clinched:** `entry.currentTotal > maxCeiling(every rival)`. Same over-estimated ceiling is a
  valid upper bound on rivals, so clinching only fires when truly safe (conservative, never false).
- **Boundary rule (tested invariant):** the exact layer alone may assign 💀. Anything the model gives
  0 sampled wins but that is **not** exactly eliminated floors at **🌱 Long shot**, never 💀.

Phase 1 ships 💀 / 🔒 / "In contention" — honest, deterministic, fast.

## 6. Strength model (Phase 2) — light, with live-odds sharpening

Two **separate** strength notions, never conflated:
- **Frozen tier** (`tiers.tier_no`) — used only by the engine for upset/goal bonuses. Never changes.
- **`strengthRating`** — used only to *predict* match outcomes in the sim.

Pipeline:
1. **Prior:** parse `tiers.odds` (American + fractional), de-vig across the 48, map outright prob → a
   rating. Fallback to a tier-derived rating if odds missing/unparseable.
2. **Light results adjustment:** nudge ratings from actual results (a simple, low-K update) so a
   favorite that keeps losing drifts down for the *far-future* knockout matches that have no odds yet.
   Kept deliberately minimal — live odds (below) carry the near-term repricing.
3. **Live-odds override (the sharpening):** for any *upcoming* fixture that has a bookmaker **Match
   Winner** market (confirmed available), de-vig the 1X2 and use it **directly** as that match's
   `{pHome,pDraw,pAway}`, overriding the rating-derived probability. Knockout/future fixtures (teams
   unknown) have no odds → fall back to the rating model. Clean hybrid, single override point in
   `strength.ts`.

**Single calibration target / contract:** `ratingDiff → {pHome,pDraw,pAway}` is the one source of
truth; live odds replace that *output* when present. Caveat (in the explainer): outright odds fold in
draw/path difficulty — a fine monotonic proxy for rough buckets.

**Live-odds fetching:** done at compute time inside the outlook run (which is results-gated and runs
only a few times a day), for fixtures kicking off within ~2–3 days; used transiently, **not persisted**
(no new columns/migration). Throttled by the gating, so API volume stays small even though we already
pay for the API.

## 7. Match & advancement model (Phase 2)

- `sim/match.ts`: from `{pHome,pDraw,pAway}` sample the outcome, then a **plausible scoreline** for the
  goal bonus (no calibrated Poisson). Produces engine-shaped `homeGoals/awayGoals/winnerTeamId/decidedBy`.
  **Knockouts can't draw:** force a winner; set `decidedBy: "penalties"` when level, and **do not add
  shootout/ET-shootout kicks to the goal count** (engine counts reg+ET only — `engine.ts:212`). Decide
  explicitly whether sampled ET goals fold into the bonus (yes, to match engine semantics).
- `sim/advance.ts`: after the (simulated or real) group stage completes, advance the knockouts by
  **strength-ordered pairing** — pair survivors, stronger team wins more often — instead of FIFA's
  exact slot map. Exact slotting is invisible at bucket resolution. **Handoff (clean boolean, not
  per-fixture mixing):** once all group matches are real-terminal, stop self-building qualifiers; once
  real knockout fixtures exist in `matches`, seed the bracket from them and only simulate forward.

## 8. The buckets (Phase 2)

Five rungs on **P(finish 1st)**, cut-points relative to **fair share `1/N`** (N = submitted entries)
so they auto-scale. Validate at N≈27.

| Emoji | Label | Basis |
|---|---|---|
| 🔥 | Front-runner | well above fair share (shows a 🔒 "clinched" flag when exact) |
| 💪 | In the hunt | comfortably above fair share |
| 🎲 | Live | around / just below fair share |
| 🌱 | Long shot | a sliver of sampled wins (>0), or model-0 but not exactly eliminated |
| 💀 | No shot | exact ceiling check (model never assigns this) |

- **Fixed constant RNG seed** → identical inputs yield identical buckets. Honest framing: this removes
  *random* jitter, not input drift; we don't promise day-to-day stability.
- **No hysteresis** initially — results-gating means buckets only move when a real result lands (which
  is exactly when they should). Add only if we observe genuine noise-flicker.
- **Exact ties for 1st in a world:** award **fractional** credit (split among all entries tied at the
  top under `compareForLeaderboard`/`rankWithTies`), mirroring real prize-splitting.

## 9. Edge cases / lifecycle (resolved)

- **Pre-lock:** don't compute or show; draft (unsubmitted) entries excluded from N.
- **Complete:** show the actual result (🏆 Champion / final rank), not a probability.
- **All-but-clinched:** exact 🔒 / 💀, not "99%".
- **0 alive teams ≠ 💀:** "alive" = future point accrual; 💀 is the ceiling/floor math, not team survival.
- **Honest presentation:** buckets + qualitative rationale; if a number, a coarse range ("~1 in 6").
- **Viewers / non-entrants:** see the ratings (public post-lock); neutral tone.
- **Staleness:** label "as of <time>"; never block the board on it; serve last-good on a stage error.

## 10. Data & storage

Migration **`0009_entry_outlook.sql`** (modeled on `recaps`/`daily_standings`: RLS public-read,
service-role writes only). No `input_fingerprint` (results-gating is the one skip mechanism).

```sql
create table entry_outlook (
  entry_id    uuid primary key references entries(id) on delete cascade,
  win_share   numeric not null,        -- P(finish 1st), 0..1 (0 = exact 💀)
  bucket      text not null,           -- 'front_runner'|'in_hunt'|'live'|'long_shot'|'no_shot'
  clinched    boolean not null default false,
  rationale   text,
  sims        integer not null,
  computed_at timestamptz not null default now()
);
alter table entry_outlook enable row level security;
create policy "entry_outlook public read" on entry_outlook for select using (true);
```
Hand-update `lib/db/types.ts` with the row shape.

## 11. Compute placement & performance

- **Dedicated cron route `/api/outlook`** (auth via `CRON_SECRET`, `vercel.json` cron entry), kept
  **out of the load-bearing 3-min ingest poll's critical path** (reviewer consensus). It self-checks a
  **results-changed** signal and skips when nothing new finalized.
- Add a `newlyTerminal`/`resultsChanged` flag to `runIngest`/`IngestSummary` — note this needs reading
  the prior row's status before upsert (the current single-upsert loop bumps `updated_at` every poll,
  so `matchesUpserted` is **not** a clean change signal). Or the outlook route derives "changed" by
  comparing the set of terminal fixtures to a stored marker.
- **Benchmark one full run (`N_SIMS × N_entries`) before finalizing**; the knockout advancement (~31
  matches/world) isn't amortized across entries and may dominate, so the "324 adds" framing understates
  cost. Start `N_SIMS` ~2–5k (plenty for 5 buckets; 10k is more precision than the output shows).

## 12. Display

- **Leaderboard row** (`app/page.tsx`, `ranked.map`): emoji + label, read from an `outlookByEntry` map
  loaded in the existing `Promise.all`. Post-lock only. Lives in the left `flex-col` near pts/game, or
  as a block under the total.
- **Entry page** (`app/entry/[id]/page.tsx`): emoji + label + coarse range after the pts line; a
  rationale card generated from the **same cached run**; link to the explainer.
- **Methodology explainer:** a section on `/how-its-built` (what Monte Carlo is, inputs incl. live odds,
  the exact-elimination rule, the honest caveat — model, not oracle).

## 13. Testing

Pure unit tests (vitest, `engine.test.ts` style): odds parsing + de-vig (both formats); `ratingDiff →
probabilities` monotonic + sums to 1; **exact bounds** (over-estimated ceiling; never falsely 💀/🔒);
the **invariant that exact-💀 and sampled buckets never contradict**; shootout/ET goal accounting;
fractional tie credit sums to 1/world; determinism (same inputs+seed → identical output); calibration
(zero-results sim ≈ de-vigged outright odds — assert against the odds, not the tuning constant).
Plus your **gut-check** on real output (favorites/longshots sane; advancement not absurd).

## 14. Phases

**Phase 1 — Exact outlook (no model). Ship first.**
`bounds.ts` + `loadOutlookInput` (terminal + remaining schedule) + migration 0009 (subset) +
`/api/outlook` cron (results-gated) + leaderboard display + tests. Delivers 💀 / 🔒 / In contention.

**Phase 2 — Lean Monte Carlo gradient + live odds.**
`odds.ts`, `strength.ts` (+ live-odds override), `sim/*`, `bucket.ts`, `rationale.ts`, the run loop,
display upgrade to the 5 buckets, methodology explainer. Benchmark + tune `N_SIMS`.

## 15. Open decisions for review

1. Concrete bucket cut-points (fair-share multiples), calibrated at N≈27.
2. `MAX_GOALS_PER_MATCH` cap value for the exact ceiling.
3. `N_SIMS` after benchmark.
4. Methodology explainer: section on `/how-its-built` vs its own page.
5. Emoji set + label/rationale wording.

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Exact 💀/🔒 wrong → tells a real person the wrong thing | Conservative over-estimated ceiling (never false, may fire late); tested invariants; total-only comparison (equal-total ≠ eliminated) |
| Strength-ordered advancement misranks deep runs | Invisible at bucket resolution; gut-check; switch to real bracket once published |
| Sim too slow | Out of the ingest poll (dedicated cron), results-gated, per-team memoization, modest N_SIMS, benchmark gate |
| Looks authoritative but is rough | Buckets/coarse ranges only; prominent methodology + caveat |
| Live odds only cover imminent games | Clean hybrid: live odds where present, rating model elsewhere |
| Numbers wobble run-to-run | Constant seed; honest "no random jitter" framing |

## 17. References

- Engine reuse: `lib/scoring/engine.ts` (`recompute` 273, `computeGroupPlacement` 141, `compareForLeaderboard` 319, goal-bonus reg+ET 212, memoization 278)
- Input recipe (terminal-only — extend): `lib/scoring/persist.ts` (`loadScoringInput`)
- Ranking/ties to reuse: `lib/standings/snapshot.ts` (`rankWithTies`)
- Derived-table + RLS precedent: `supabase/migrations/0003_tournament_mode.sql:21-54`; latest = `0008_venue.sql` (next 0009)
- Ingest / change signal: `lib/api-football/ingest.ts:23-30,88,136-144`
- Live odds: `/odds?fixture=…` (Match Winner, 14 bookmakers) — confirmed available
- Poll pattern / cron auth: `app/api/poll/route.ts` (`CRON_SECRET`, wrapped stages)
- Display: `app/page.tsx` (`ranked.map`), `app/entry/[id]/page.tsx`
- Precedent plan: `docs/plans/2026-06-07-001-feat-tournament-mode-plan.md`
- External: Wikipedia "2026 FIFA World Cup knockout stage" (for the real bracket once published)
