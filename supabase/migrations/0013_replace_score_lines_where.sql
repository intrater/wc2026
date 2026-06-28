-- Fix replace_score_lines from 0012: Supabase's safe-delete guard rejects an unqualified
-- DELETE even inside a function ("DELETE requires a WHERE clause"). Add `where true`, which
-- deletes all rows and satisfies the guard. (Atomicity / anti-duplication behaviour unchanged.)
create or replace function replace_score_lines(p_lines jsonb)
returns void
language plpgsql
as $$
begin
  delete from score_lines where true;
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
