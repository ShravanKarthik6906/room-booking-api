-- =====================================================================
-- On-Campus Room Booking System — database schema
-- Paste this whole file into Supabase Dashboard → SQL Editor → Run.
-- It is safe to run more than once.
-- =====================================================================

-- Needed so a GiST index can compare room_id (uuid) with "=".
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  email      text,
  created_at timestamptz default now()
);

create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  building   text not null,
  capacity   int  not null check (capacity > 0),
  created_at timestamptz default now()
);

create table if not exists public.bookings (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  start_time timestamptz not null,
  end_time   timestamptz not null,
  status     text not null default 'confirmed'
             check (status in ('confirmed', 'cancelled')),
  created_at timestamptz default now(),

  constraint bookings_end_after_start check (end_time > start_time),

  -- THE double-booking guard: no two *confirmed* bookings for the same room
  -- may have overlapping time ranges. Ranges are [start, end), so a booking
  -- ending at 10:00 and another starting at 10:00 do NOT conflict.
  -- Violations raise Postgres error 23P01 (exclusion_violation).
  constraint bookings_no_overlap exclude using gist (
    room_id with =,
    tstzrange(start_time, end_time) with &&
  ) where (status = 'confirmed')
);

create index if not exists bookings_user_id_idx on public.bookings (user_id);

-- ---------------------------------------------------------------------
-- Auto-create a profile row whenever someone signs up
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that existed before this trigger.
insert into public.profiles (id, email, full_name)
select id, email, raw_user_meta_data ->> 'full_name'
from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Row Level Security
-- The API uses the anon key. For logged-in routes it forwards the user's
-- JWT, so auth.uid() inside these policies is the caller's user id.
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.rooms    enable row level security;
alter table public.bookings enable row level security;

-- Rooms: anyone (logged in or not) can browse.
drop policy if exists "Anyone can read rooms" on public.rooms;
create policy "Anyone can read rooms"
  on public.rooms for select
  to anon, authenticated
  using (true);

-- Profiles: you can read only your own.
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- Bookings: logged-in users can read bookings (needed to check conflicts,
-- show availability, and tell "not yours" (403) apart from "not found" (404)).
drop policy if exists "Authenticated users can read bookings" on public.bookings;
create policy "Authenticated users can read bookings"
  on public.bookings for select
  to authenticated
  using (true);

-- Bookings: you can only create bookings for yourself.
drop policy if exists "Users can insert own bookings" on public.bookings;
create policy "Users can insert own bookings"
  on public.bookings for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Bookings: you can only update (cancel) your own bookings.
drop policy if exists "Users can update own bookings" on public.bookings;
create policy "Users can update own bookings"
  on public.bookings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Seed data: Rutgers–New Brunswick study rooms
-- (only inserted if the rooms table is empty)
-- ---------------------------------------------------------------------

insert into public.rooms (name, building, capacity)
select * from (values
  ('Group Study Room 401',  'Alexander Library',                  6),
  ('Room 120',              'Busch Student Center',              30),
  ('Room 202C',             'Livingston Student Center',         12),
  ('Group Study Room A',    'Douglass Library',                   4),
  ('Room 411',              'College Avenue Student Center',     20),
  ('Collaboration Room 2',  'Library of Science and Medicine',    8),
  ('Study Room 105',        'James Dickson Carr Library',          5),
  ('Room 2050',             'Academic Building East Wing',       40)
) as seed (name, building, capacity)
where not exists (select 1 from public.rooms);
