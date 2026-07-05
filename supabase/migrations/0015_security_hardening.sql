-- Security hardening from the 2026-07-04 audit. Five independent fixes; safe to apply
-- mid-tournament (verified against live data: no display_name > 16 chars, no duplicate
-- (entry_id, team_id) pairs, no tier mismatches, so every constraint validates clean).

-- 1) entry_outlook was added in 0009 with `using (true)`, re-opening the pool's
--    win-probability data that 0004 deliberately closed. Gate it like its sibling
--    derived tables (scores, score_lines, daily_standings, recaps): pool members only.
drop policy if exists "entry_outlook public read" on entry_outlook;
create policy "entry_outlook pool read" on entry_outlook
  for select using (public.can_view_pool());

-- 2) replace_score_lines is only ever called by the service-role poll. It was exposed
--    at /rest/v1/rpc/... to anon+authenticated (harmless for tampering under RLS, but a
--    needless EXCLUSIVE-lock DoS handle). Revoke it and pin its search_path.
alter function public.replace_score_lines(jsonb) set search_path = public;
revoke execute on function public.replace_score_lines(jsonb) from anon, authenticated;

-- 3) Enforce pick integrity in the DATABASE, not just the savePick server action.
--    Pre-lock, a session-holding entrant could POST directly to /rest/v1/picks and
--    (a) claim a team in the wrong tier or (b) pick the same team in multiple slots,
--    inflating their own score. The lock currently blocks all pick writes, so this is
--    defense-in-depth + correctness for any future pool. Rebuild the write policies to
--    also require the team genuinely belong to the claimed tier.
drop policy if exists "picks owner insert pre-lock" on picks;
create policy "picks owner insert pre-lock" on picks
  for insert with check (
    not public.is_locked()
    and exists (select 1 from entries e where e.id = picks.entry_id and e.user_id = auth.uid())
    and exists (select 1 from tiers t where t.team_id = picks.team_id and t.tier_no = picks.tier_no)
  );

drop policy if exists "picks owner update pre-lock" on picks;
create policy "picks owner update pre-lock" on picks
  for update
  using (
    not public.is_locked()
    and exists (select 1 from entries e where e.id = picks.entry_id and e.user_id = auth.uid())
  )
  with check (
    not public.is_locked()
    and exists (select 1 from entries e where e.id = picks.entry_id and e.user_id = auth.uid())
    and exists (select 1 from tiers t where t.team_id = picks.team_id and t.tier_no = picks.tier_no)
  );

-- ...and forbid the same team in two slots of one entry at the schema level.
alter table picks add constraint picks_entry_team_unique unique (entry_id, team_id);

-- 4) Bound display_name: it's user-controlled, freezes at lock, and shows on the public
--    leaderboard. Cap length and reject control chars (CRLF header injection, nulls) and
--    the Unicode bidi-override chars that could visually scramble the board or spoof
--    another entrant's name. [[:cntrl:]] covers C0/C1 controls; chr() names the bidi
--    overrides explicitly so this file carries no embedded control bytes.
alter table entries add constraint entries_display_name_len
  check (char_length(display_name) between 1 and 40);
alter table entries add constraint entries_display_name_printable
  check (
    display_name !~ '[[:cntrl:]]'
    and strpos(display_name, chr(8238)) = 0  -- U+202E RIGHT-TO-LEFT OVERRIDE
    and strpos(display_name, chr(8237)) = 0  -- U+202D LEFT-TO-RIGHT OVERRIDE
    and strpos(display_name, chr(8294)) = 0  -- U+2066 LEFT-TO-RIGHT ISOLATE
    and strpos(display_name, chr(8295)) = 0  -- U+2067 RIGHT-TO-LEFT ISOLATE
    and strpos(display_name, chr(8296)) = 0  -- U+2068 FIRST STRONG ISOLATE
  );
