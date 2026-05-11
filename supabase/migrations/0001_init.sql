-- Wanderly schema + RLS
-- Run this in the Supabase SQL editor (or `supabase db push` with the CLI).
--
-- Order matters in Postgres: tables are created first, then helper functions
-- (which reference those tables), then RLS policies (which reference the
-- helpers), then triggers, then the realtime publication.

-- =========================================================================
-- 1. Extensions
-- =========================================================================
create extension if not exists "pgcrypto";

-- =========================================================================
-- 2. Tables (in dependency order)
-- =========================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.trips (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title           text not null,
  description     text,
  destination     text,
  start_date      date,
  end_date        date,
  cover_image_url text,
  share_token     text unique,
  share_enabled   boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists trips_owner_id_idx on public.trips(owner_id);

create table if not exists public.trip_members (
  trip_id    uuid not null references public.trips(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index if not exists trip_members_user_idx on public.trip_members(user_id);

create table if not exists public.trip_invites (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('editor', 'viewer')),
  token       text not null unique,
  invited_by  uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists trip_invites_trip_idx on public.trip_invites(trip_id);
create index if not exists trip_invites_email_idx on public.trip_invites(lower(email));

create table if not exists public.trip_days (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  day_index  int not null,
  date       date,
  notes      text,
  created_at timestamptz not null default now(),
  unique (trip_id, day_index)
);
create index if not exists trip_days_trip_idx on public.trip_days(trip_id);

create table if not exists public.places (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  name       text not null,
  address    text,
  lat        double precision,
  lng        double precision,
  category   text,
  notes      text,
  url        text,
  rating     numeric,
  cost       numeric,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists places_trip_idx on public.places(trip_id);

create table if not exists public.itinerary_items (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  day_id      uuid not null references public.trip_days(id) on delete cascade,
  place_id    uuid references public.places(id) on delete set null,
  position    int not null default 0,
  start_time  time,
  end_time    time,
  title       text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists itinerary_items_trip_idx on public.itinerary_items(trip_id);
create index if not exists itinerary_items_day_idx on public.itinerary_items(day_id);

-- =========================================================================
-- 3. Helper functions (used by RLS policies)
--    SECURITY DEFINER bypasses RLS on lookups so policies don't recurse.
-- =========================================================================
create or replace function public.is_trip_member(_trip uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = _trip and user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_editor(_trip uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = _trip and user_id = auth.uid()
      and role in ('owner', 'editor')
  );
$$;

create or replace function public.is_trip_owner(_trip uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = _trip and user_id = auth.uid() and role = 'owner'
  );
$$;

-- =========================================================================
-- 4. Enable RLS
-- =========================================================================
alter table public.profiles        enable row level security;
alter table public.trips           enable row level security;
alter table public.trip_members    enable row level security;
alter table public.trip_invites    enable row level security;
alter table public.trip_days       enable row level security;
alter table public.places          enable row level security;
alter table public.itinerary_items enable row level security;

-- =========================================================================
-- 5. RLS policies
-- =========================================================================

-- profiles ----------------------------------------------------------------
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles read collaborators" on public.profiles;
create policy "profiles read collaborators"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.trip_members me
      join public.trip_members them on them.trip_id = me.trip_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );

drop policy if exists "profiles upsert self" on public.profiles;
create policy "profiles upsert self"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self"
  on public.profiles for update
  using (auth.uid() = id);

-- trips -------------------------------------------------------------------
drop policy if exists "trips select members" on public.trips;
create policy "trips select members"
  on public.trips for select
  using (public.is_trip_member(id) or share_enabled);

drop policy if exists "trips insert owner" on public.trips;
create policy "trips insert owner"
  on public.trips for insert
  with check (auth.uid() = owner_id);

drop policy if exists "trips update editor" on public.trips;
create policy "trips update editor"
  on public.trips for update
  using (public.is_trip_editor(id));

drop policy if exists "trips delete owner" on public.trips;
create policy "trips delete owner"
  on public.trips for delete
  using (public.is_trip_owner(id));

-- trip_members ------------------------------------------------------------
drop policy if exists "members select self or co-member" on public.trip_members;
create policy "members select self or co-member"
  on public.trip_members for select
  using (
    user_id = auth.uid()
    or public.is_trip_member(trip_id)
  );

drop policy if exists "members insert self via invite or owner" on public.trip_members;
create policy "members insert self via invite or owner"
  on public.trip_members for insert
  with check (
    public.is_trip_owner(trip_id)
    or user_id = auth.uid()
  );

drop policy if exists "members update by owner" on public.trip_members;
create policy "members update by owner"
  on public.trip_members for update
  using (public.is_trip_owner(trip_id));

drop policy if exists "members delete by owner or self" on public.trip_members;
create policy "members delete by owner or self"
  on public.trip_members for delete
  using (public.is_trip_owner(trip_id) or user_id = auth.uid());

-- trip_invites ------------------------------------------------------------
drop policy if exists "invites select members or invitee" on public.trip_invites;
create policy "invites select members or invitee"
  on public.trip_invites for select
  using (
    public.is_trip_member(trip_id)
    or lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
  );

drop policy if exists "invites insert by editor" on public.trip_invites;
create policy "invites insert by editor"
  on public.trip_invites for insert
  with check (public.is_trip_editor(trip_id) and invited_by = auth.uid());

drop policy if exists "invites update by editor or invitee" on public.trip_invites;
create policy "invites update by editor or invitee"
  on public.trip_invites for update
  using (
    public.is_trip_editor(trip_id)
    or lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
  );

drop policy if exists "invites delete by editor" on public.trip_invites;
create policy "invites delete by editor"
  on public.trip_invites for delete
  using (public.is_trip_editor(trip_id));

-- trip_days ---------------------------------------------------------------
drop policy if exists "days select members or shared" on public.trip_days;
create policy "days select members or shared"
  on public.trip_days for select
  using (
    public.is_trip_member(trip_id)
    or exists (select 1 from public.trips t where t.id = trip_id and t.share_enabled)
  );

drop policy if exists "days insert by editor" on public.trip_days;
create policy "days insert by editor" on public.trip_days for insert
  with check (public.is_trip_editor(trip_id));
drop policy if exists "days update by editor" on public.trip_days;
create policy "days update by editor" on public.trip_days for update
  using (public.is_trip_editor(trip_id));
drop policy if exists "days delete by editor" on public.trip_days;
create policy "days delete by editor" on public.trip_days for delete
  using (public.is_trip_editor(trip_id));

-- places ------------------------------------------------------------------
drop policy if exists "places select members or shared" on public.places;
create policy "places select members or shared"
  on public.places for select
  using (
    public.is_trip_member(trip_id)
    or exists (select 1 from public.trips t where t.id = trip_id and t.share_enabled)
  );

drop policy if exists "places insert by editor" on public.places;
create policy "places insert by editor" on public.places for insert
  with check (public.is_trip_editor(trip_id) and created_by = auth.uid());
drop policy if exists "places update by editor" on public.places;
create policy "places update by editor" on public.places for update
  using (public.is_trip_editor(trip_id));
drop policy if exists "places delete by editor" on public.places;
create policy "places delete by editor" on public.places for delete
  using (public.is_trip_editor(trip_id));

-- itinerary_items ---------------------------------------------------------
drop policy if exists "items select members or shared" on public.itinerary_items;
create policy "items select members or shared"
  on public.itinerary_items for select
  using (
    public.is_trip_member(trip_id)
    or exists (select 1 from public.trips t where t.id = trip_id and t.share_enabled)
  );

drop policy if exists "items insert by editor" on public.itinerary_items;
create policy "items insert by editor" on public.itinerary_items for insert
  with check (public.is_trip_editor(trip_id));
drop policy if exists "items update by editor" on public.itinerary_items;
create policy "items update by editor" on public.itinerary_items for update
  using (public.is_trip_editor(trip_id));
drop policy if exists "items delete by editor" on public.itinerary_items;
create policy "items delete by editor" on public.itinerary_items for delete
  using (public.is_trip_editor(trip_id));

-- =========================================================================
-- 6. Triggers
-- =========================================================================

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Owner row is created automatically when a trip is inserted.
create or replace function public.handle_new_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_trip_created on public.trips;
create trigger on_trip_created
  after insert on public.trips
  for each row execute function public.handle_new_trip();

-- Maintain trips.updated_at on row updates.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trips_touch_updated_at on public.trips;
create trigger trips_touch_updated_at
  before update on public.trips
  for each row execute function public.touch_updated_at();

-- =========================================================================
-- 7. Realtime publication
-- =========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trips'
  ) then
    execute 'alter publication supabase_realtime add table public.trips';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_days'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_days';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'places'
  ) then
    execute 'alter publication supabase_realtime add table public.places';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'itinerary_items'
  ) then
    execute 'alter publication supabase_realtime add table public.itinerary_items';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_members'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_members';
  end if;
end$$;
