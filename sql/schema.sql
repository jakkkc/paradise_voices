-- ============================================================
-- Paradise Voices — Supabase schema (source of truth)
-- This file reflects the CURRENT, up-to-date database — every fix made
-- along the way (room categories, staff functions, etc.) is folded in.
--
-- Run this only against a FRESH/EMPTY Supabase project — it uses
-- `create table`, which fails if the tables already exist. Your live
-- project already has all of this applied; this file exists so you
-- could rebuild the database from scratch if you ever needed to
-- (new Supabase project, disaster recovery, etc).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. BRANCHES
-- ------------------------------------------------------------
create table branches (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,        -- 'HPC' or 'HPT'
  name text not null
);

-- ------------------------------------------------------------
-- 2. ROOM CATEGORIES (per branch)
-- ------------------------------------------------------------
create table room_categories (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  unique (branch_id, name)
);

-- ------------------------------------------------------------
-- 3. ROOMS — preloaded list the receptionist picks from.
--    I've seeded a few PLACEHOLDER room numbers per category
--    (marked below) — edit these to your real room numbers,
--    or leave them and we'll add a proper "manage rooms"
--    screen for management in Step 6.
-- ------------------------------------------------------------
create table rooms (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  category_id uuid not null references room_categories(id) on delete cascade,
  room_number text not null,
  active boolean not null default true,
  unique (branch_id, room_number)
);

-- ------------------------------------------------------------
-- 4. STAFF ROLES — the 3 PIN logins. Not readable directly by
--    the app (see RLS below) — only through verify_pin().
-- ------------------------------------------------------------
create table staff_roles (
  id uuid primary key default gen_random_uuid(),
  role_key text unique not null,           -- 'hpc_reception' | 'hpt_reception' | 'management'
  branch_id uuid references branches(id),  -- null for management (applies to both branches)
  display_name text not null,
  pin text not null
);

-- ------------------------------------------------------------
-- 5. TEAM MEMBERS — for Step 4 "Who Made Your Stay Special"
--    checkboxes, grouped by department. Seeded with a couple
--    of PLACEHOLDER names per branch — edit/replace freely.
-- ------------------------------------------------------------
create table team_members (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  department text not null,   -- 'Front Desk' | 'Housekeeping' | 'Concierge' | etc.
  name text not null,
  active boolean not null default true
);

-- ------------------------------------------------------------
-- 6. FEEDBACK — one row per guest submission
-- ------------------------------------------------------------
create table feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  branch_id uuid not null references branches(id),
  room_id uuid not null references rooms(id),

  -- Step 2: Stay ratings (1-5 scale)
  front_office_rating smallint not null check (front_office_rating between 1 and 5),
  housekeeping_rating smallint not null check (housekeeping_rating between 1 and 5),
  room_comfort_rating smallint not null check (room_comfort_rating between 1 and 5),
  facilities_rating smallint check (facilities_rating between 1 and 5),
  value_rating smallint check (value_rating between 1 and 5),
  overall_rating smallint check (overall_rating between 1 and 5),

  -- Step 3
  nps smallint check (nps between 0 and 10),
  referral_source text not null check (referral_source in ('online','referral','repeat_guest','other')),

  -- Step 5
  comment text,
  guest_name text,
  guest_contact text
);

-- ------------------------------------------------------------
-- 7. FEEDBACK ↔ TEAM MEMBER mentions (Step 4, multi-select)
-- ------------------------------------------------------------
create table feedback_mentions (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references feedback(id) on delete cascade,
  team_member_id uuid not null references team_members(id)
);

-- ============================================================
-- SEED DATA
-- ============================================================

insert into branches (code, name) values
  ('HPC', 'Hunters Paradise Cottages'),
  ('HPT', 'Hunters Paradise Tuuti');

-- HPC categories
insert into room_categories (branch_id, name)
select id, cat from branches, unnest(array['Engwe','Kibeu','Emboko','Enjofu','Etalangi']) as cat
where code = 'HPC';

-- HPT categories
insert into room_categories (branch_id, name)
select id, cat from branches, unnest(array['Kibeu Single Bed','Kibeu Double Bed']) as cat
where code = 'HPT';

-- HPC: Engwe En1..En12
insert into rooms (branch_id, category_id, room_number)
select b.id, rc.id, 'En' || n
from branches b
cross join generate_series(1,12) as n
join room_categories rc on rc.branch_id = b.id and rc.name = 'Engwe'
where b.code = 'HPC';

-- HPC: Kibeu K1..K14, no K13
insert into rooms (branch_id, category_id, room_number)
select b.id, rc.id, 'K' || n
from branches b
cross join generate_series(1,14) as n
join room_categories rc on rc.branch_id = b.id and rc.name = 'Kibeu'
where b.code = 'HPC' and n <> 13;

-- HPC: Emboko Emb1..Emb4
insert into rooms (branch_id, category_id, room_number)
select b.id, rc.id, 'Emb' || n
from branches b
cross join generate_series(1,4) as n
join room_categories rc on rc.branch_id = b.id and rc.name = 'Emboko'
where b.code = 'HPC';

-- HPC: Enjofu Enj1, Enj2
insert into rooms (branch_id, category_id, room_number)
select b.id, rc.id, 'Enj' || n
from branches b
cross join generate_series(1,2) as n
join room_categories rc on rc.branch_id = b.id and rc.name = 'Enjofu'
where b.code = 'HPC';

-- HPC: Etalangi — single VIP room
insert into rooms (branch_id, category_id, room_number)
select b.id, rc.id, 'VIP'
from branches b
join room_categories rc on rc.branch_id = b.id and rc.name = 'Etalangi'
where b.code = 'HPC';

-- HPT: Kibeu K1..K17 — K1, K5, K12, K16 are twin -> Kibeu Double Bed, rest -> Kibeu Single Bed
insert into rooms (branch_id, category_id, room_number)
select b.id, rc.id, 'K' || n
from branches b
cross join generate_series(1,17) as n
join room_categories rc on rc.branch_id = b.id
  and rc.name = case when n in (1,5,12,16) then 'Kibeu Double Bed' else 'Kibeu Single Bed' end
where b.code = 'HPT';

-- Staff PIN logins
insert into staff_roles (role_key, branch_id, display_name, pin)
select 'hpc_reception', id, 'HPC Reception', '1111' from branches where code = 'HPC'
union all
select 'hpt_reception', id, 'HPT Reception', '2222' from branches where code = 'HPT'
union all
select 'management', null, 'Management', '1234';

-- Team members are NOT seeded here — management builds this list entirely
-- from the dashboard's "Add Staff Member" screen (Staff Settings). A fresh
-- database starts with an empty team_members table.

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table branches enable row level security;
alter table room_categories enable row level security;
alter table rooms enable row level security;
alter table team_members enable row level security;
alter table staff_roles enable row level security;   -- no policies = fully locked, only via functions below
alter table feedback enable row level security;
alter table feedback_mentions enable row level security;

-- Public, non-sensitive lookup data — anyone with the app can read these
create policy "public read branches" on branches for select using (true);
create policy "public read categories" on room_categories for select using (true);
create policy "public read rooms" on rooms for select using (true);
create policy "public read team members" on team_members for select using (true);

-- Guests can submit feedback, but nobody can read it back directly —
-- reading only happens through get_management_feedback() below.
create policy "anyone can submit feedback" on feedback for insert with check (true);
create policy "anyone can submit mentions" on feedback_mentions for insert with check (true);

-- ============================================================
-- SECURE FUNCTIONS (bypass RLS safely, since they check the PIN themselves)
-- ============================================================

-- Checks a PIN and returns which role/branch it belongs to, or nothing if wrong.
create or replace function verify_pin(input_pin text)
returns table (role_key text, branch_id uuid, branch_code text, display_name text)
language sql
security definer
set search_path = public
as $$
  select sr.role_key, sr.branch_id, b.code, sr.display_name
  from staff_roles sr
  left join branches b on b.id = sr.branch_id
  where sr.pin = input_pin;
$$;

-- Returns ALL feedback rows, but only if the correct management PIN is passed.
create or replace function get_management_feedback(input_pin text)
returns setof feedback
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from staff_roles where role_key = 'management' and pin = input_pin) then
    raise exception 'Invalid management PIN';
  end if;
  return query select * from feedback order by created_at desc;
end;
$$;

-- Lets management change a role's PIN and/or display name.
create or replace function update_staff_credentials(
  input_mgmt_pin text,
  target_role_key text,
  new_pin text default null,
  new_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from staff_roles where role_key = 'management' and pin = input_mgmt_pin) then
    raise exception 'Invalid management PIN';
  end if;
  update staff_roles
  set pin = coalesce(new_pin, pin),
      display_name = coalesce(new_display_name, display_name)
  where role_key = target_role_key;
end;
$$;

-- Lets management list current staff display names (never PINs) for the
-- Staff Settings screen.
create or replace function get_staff_roles(input_pin text)
returns table (role_key text, branch_code text, display_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from staff_roles where role_key = 'management' and pin = input_pin) then
    raise exception 'Invalid management PIN';
  end if;

  return query
  select sr.role_key, b.code, sr.display_name
  from staff_roles sr
  left join branches b on b.id = sr.branch_id;
end;
$$;

-- Lets management read which team members were mentioned on each
-- feedback row (for "Served by ..." on the dashboard).
create or replace function get_management_mentions(input_pin text)
returns table (feedback_id uuid, team_member_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from staff_roles where role_key = 'management' and pin = input_pin) then
    raise exception 'Invalid management PIN';
  end if;

  return query select fm.feedback_id, fm.team_member_id from feedback_mentions fm;
end;
$$;

-- Adds a staff member to Front Office / Housekeeping / etc. — applied to
-- both branches at once, since the same team serves both. Typing a brand
-- new department name here creates that department (departments aren't
-- a separate table — they're just whatever's in use).
create or replace function add_team_member(input_mgmt_pin text, input_department text, input_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from staff_roles where role_key = 'management' and pin = input_mgmt_pin) then
    raise exception 'Invalid management PIN';
  end if;

  insert into team_members (branch_id, department, name)
  select id, input_department, input_name from branches where code in ('HPC', 'HPT');
end;
$$;

-- Removes a staff member from both branches at once.
create or replace function remove_team_member(input_mgmt_pin text, input_department text, input_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from staff_roles where role_key = 'management' and pin = input_mgmt_pin) then
    raise exception 'Invalid management PIN';
  end if;

  delete from team_members
  where department = input_department
    and name = input_name
    and branch_id in (select id from branches where code in ('HPC', 'HPT'));
end;
$$;

-- Renames a staff member and/or moves them to a different department —
-- applied to both branches at once.
create or replace function update_team_member(
  input_mgmt_pin text,
  input_department text,
  input_name text,
  new_department text,
  new_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from staff_roles where role_key = 'management' and pin = input_mgmt_pin) then
    raise exception 'Invalid management PIN';
  end if;

  update team_members
  set department = coalesce(new_department, department),
      name = coalesce(new_name, name)
  where department = input_department
    and name = input_name
    and branch_id in (select id from branches where code in ('HPC', 'HPT'));
end;
$$;

grant execute on function verify_pin(text) to anon;
grant execute on function get_management_feedback(text) to anon;
grant execute on function update_staff_credentials(text, text, text, text) to anon;
grant execute on function get_staff_roles(text) to anon;
grant execute on function get_management_mentions(text) to anon;
grant execute on function add_team_member(text, text, text) to anon;
grant execute on function remove_team_member(text, text, text) to anon;
grant execute on function update_team_member(text, text, text, text, text) to anon;

-- ============================================================
-- Done. Next: verify in Table Editor that branches/room_categories/
-- rooms/staff_roles/team_members all have rows.
-- ============================================================