-- Atomic score_lines replacement (2026-06-28). persistScores used to DELETE all rows then
-- INSERT the fresh set as two separate statements; two recomputes racing could interleave
-- (delete, delete, insert, insert) and leave every line duplicated — score_lines sum = 2×
-- the stored total. (Caught by the integrity monitor; self-healed on the next clean pass.)
-- This function does the delete + insert in ONE transaction, so concurrent callers serialize
-- on the table lock and the result is always exactly one set — never doubled.
create or replace function replace_score_lines(p_lines jsonb)
returns void
language plpgsql
as $$
begin
  delete from score_lines;  -- NOTE: fixed in 0013 (Supabase safe-delete guard needs a WHERE)
  insert into score_lines (entry_id, team_id, match_id, points, label, category)
  select (e->>'entry_id')::uuid,
         (e->>'team_id')::integer,
         (e->>'match_id')::bigint,   -- JSON null / absent → SQL NULL (group-placement bonuses)
         (e->>'points')::numeric,
          e->>'label',
          e->>'category'
  from jsonb_array_elements(p_lines) as e;
end;
$$;
