-- Serialize replace_score_lines so concurrent recomputes can't duplicate rows.
-- A single transaction is NOT enough: under READ COMMITTED each call's DELETE doesn't see
-- the others' uncommitted INSERTs, and the inserts don't conflict (random-uuid PKs), so N
-- concurrent calls leave N copies. Taking an EXCLUSIVE table lock first makes the calls run
-- strictly one-at-a-time — each sees the previous committed set, deletes it, inserts fresh —
-- so the result is always exactly one set. EXCLUSIVE still allows concurrent reads.
create or replace function replace_score_lines(p_lines jsonb)
returns void
language plpgsql
as $$
begin
  lock table score_lines in exclusive mode;
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
