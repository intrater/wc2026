-- World Cup 2026 Pool — RLS
--
-- Security model:
--   * Reads are public where the data is public (teams, tiers, settings, entries,
--     matches, scores) and owner-gated where private (picks pre-lock, profiles).
--   * ALL admin mutations (paid toggle, result override, tier freeze, lock) run through
--     server actions using the service-role key, which BYPASSES RLS. So most tables need
--     no client write policy at all — absence of a policy denies client writes by default.
--   * Owner writes (own entry, own picks) go through RLS as the authenticated user.

-- ---------- helper functions (security definer to avoid recursion + per-row cost) ----------
create or replace function public.is_locked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select lock_at from settings where id), 'infinity'::timestamptz) <= now();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from profiles where user_id = auth.uid()), false);
$$;

-- ---------- auto-create a profile row on signup ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- guard: only service-role (admin) may change paid; nobody changes user_id ----------
create or replace function public.guard_entry_update()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable';
  end if;
  if new.paid is distinct from old.paid and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'only admin may change paid status';
  end if;
  return new;
end;
$$;

create trigger entries_guard_update
  before update on entries
  for each row execute function public.guard_entry_update();

-- ---------- enable RLS everywhere ----------
alter table teams       enable row level security;
alter table tiers       enable row level security;
alter table settings    enable row level security;
alter table profiles    enable row level security;
alter table entries     enable row level security;
alter table picks        enable row level security;
alter table matches     enable row level security;
alter table scores      enable row level security;
alter table score_lines enable row level security;

-- ---------- public-read tables (writes via service role only) ----------
create policy "teams public read"       on teams       for select using (true);
create policy "tiers public read"       on tiers       for select using (true);
create policy "settings public read"    on settings    for select using (true);
create policy "matches public read"     on matches     for select using (true);
create policy "scores public read"      on scores      for select using (true);
create policy "score_lines public read" on score_lines for select using (true);

-- ---------- entries: public read; owner insert/update (pre-lock) ----------
create policy "entries public read" on entries
  for select using (true);

create policy "entries owner insert" on entries
  for insert with check (auth.uid() = user_id and not public.is_locked());

create policy "entries owner update pre-lock" on entries
  for update
  using (auth.uid() = user_id and not public.is_locked())
  with check (auth.uid() = user_id);
-- (paid/user_id changes are blocked by guard_entry_update; admin uses service role.)

-- ---------- picks: owner always; everyone after lock; owner writes pre-lock ----------
create policy "picks owner or post-lock read" on picks
  for select using (
    public.is_locked()
    or exists (select 1 from entries e where e.id = picks.entry_id and e.user_id = auth.uid())
  );

create policy "picks owner insert pre-lock" on picks
  for insert with check (
    not public.is_locked()
    and exists (select 1 from entries e where e.id = picks.entry_id and e.user_id = auth.uid())
  );

create policy "picks owner update pre-lock" on picks
  for update
  using (
    not public.is_locked()
    and exists (select 1 from entries e where e.id = picks.entry_id and e.user_id = auth.uid())
  )
  with check (
    not public.is_locked()
    and exists (select 1 from entries e where e.id = picks.entry_id and e.user_id = auth.uid())
  );

create policy "picks owner delete pre-lock" on picks
  for delete using (
    not public.is_locked()
    and exists (select 1 from entries e where e.id = picks.entry_id and e.user_id = auth.uid())
  );

-- ---------- profiles: self or admin read; writes via service role only ----------
create policy "profiles self or admin read" on profiles
  for select using (user_id = auth.uid() or public.is_admin());
