-- ============================================================
-- Paradise Voices — Supabase schema (source of truth)
-- This file reflects the CURRENT, up-to-date database — every fix made
-- along the way (room categories, staff functions, etc.) is folded in.
--
-- HOW TO USE THIS FILE
--   * New/empty Supabase project: run the whole file once.
--   * Existing project: do NOT run the whole file (the base tables already
--     exist, so it stops at the first line). Run only the single block you
--     need, e.g. the "Resolved feedback" block or the "PIN safety" block at
--     the bottom. Those blocks are safe to run more than once.
--   * The loyalty stage 2 and 3 functions (desk, redeem, overview, export)
--     live only in the live database; they are not in this file yet.
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
-- ------------------------------------------------------------
-- Added later: how each response was collected
-- (reception tablet, a room's QR code, or the reception QR code)
-- ------------------------------------------------------------
alter table feedback
  add column if not exists source text not null default 'tablet'
  check (source in ('tablet','room_qr','reception_qr'));
-- ============================================================
-- Paradise Voices - Loyalty programme, stage 1: database + settings
-- All loyalty tables are fully locked (RLS on, no policies).
-- Everything goes through PIN-checked functions, like the rest of the app.
-- Safe to run more than once.
-- ============================================================

-- Helper: stops a function unless the management PIN was given.
create or replace function assert_management(input_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from staff_roles where role_key = 'management' and pin = input_pin) then
    raise exception 'Invalid management PIN';
  end if;
end;
$$;

revoke execute on function assert_management(text) from public, anon, authenticated;

-- ---- Programme settings (always exactly one row) ----
create table if not exists loyalty_settings (
  id boolean primary key default true check (id),
  earn_percent numeric(5,2) not null default 5
    check (earn_percent >= 0 and earn_percent <= 100),
  point_value_kes numeric(10,2) not null default 1
    check (point_value_kes > 0),
  expiry_months integer not null default 24
    check (expiry_months >= 0),
  large_redemption_points integer not null default 0
    check (large_redemption_points >= 0),
  updated_at timestamptz not null default now()
);

insert into loyalty_settings (id) values (true) on conflict (id) do nothing;

-- ---- Nightly rate per room category (set by management) ----
create table if not exists loyalty_category_rates (
  category_id uuid primary key references room_categories(id) on delete cascade,
  rate_per_night_kes numeric(12,2) not null check (rate_per_night_kes >= 0),
  updated_at timestamptz not null default now()
);

-- ---- Fixed rewards offered at the desk ----
create table if not exists loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  points integer not null check (points > 0),
  label text not null,
  sort_order integer not null default 0
);

insert into loyalty_rewards (points, label, sort_order)
select v.points, v.label, v.sort_order
from (values
  (5000,  'KES 5,000 off the next stay', 1),
  (10000, 'A room upgrade or KES 10,000 credit', 2),
  (50000, 'One free night in an Etalangi', 3)
) as v(points, label, sort_order)
where not exists (select 1 from loyalty_rewards);

-- ---- Members (identified by phone number, stored as +2547XXXXXXXX) ----
create table if not exists loyalty_members (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text not null,
  email text,
  consent_at timestamptz not null default now(),
  enrolled_branch_id uuid references branches(id),
  created_at timestamptz not null default now()
);

-- ---- Ledger: every earn / redeem / adjustment is its own permanent line ----
-- A member's balance is the total of their lines. Positive points add,
-- negative points subtract.
create table if not exists loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references loyalty_members(id),
  type text not null check (type in ('earn','bonus','redeem','adjust','expire')),
  points integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  branch_id uuid references branches(id),
  staff_role text,
  room_id uuid references rooms(id),
  category_id uuid references room_categories(id),
  nights integer check (nights is null or nights > 0),
  rate_per_night_kes numeric(12,2),
  earn_percent numeric(5,2),
  point_value_kes numeric(10,2),
  stay_date date,
  reward_label text,
  note text,
  constraint loyalty_points_sign check (
    points <> 0 and (
      (type in ('earn','bonus') and points > 0)
      or (type = 'redeem' and points < 0)
      or type in ('adjust','expire')
    )
  )
);

-- The same member cannot be awarded twice for the same room on the same day.
create unique index if not exists loyalty_one_award_per_stay
  on loyalty_transactions (member_id, room_id, stay_date)
  where type = 'earn';

create index if not exists loyalty_tx_member on loyalty_transactions (member_id, created_at);

-- Lock every loyalty table: no direct access, only through the functions.
alter table loyalty_settings enable row level security;
alter table loyalty_category_rates enable row level security;
alter table loyalty_rewards enable row level security;
alter table loyalty_members enable row level security;
alter table loyalty_transactions enable row level security;

-- ---- Management: read all programme settings in one go ----
create or replace function get_loyalty_settings(input_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_management(input_pin);

  return jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' from loyalty_settings s limit 1),
    'rates', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'category_id', rc.id,
                 'category_name', rc.name,
                 'branch_code', b.code,
                 'rate_per_night_kes', r.rate_per_night_kes
               )
               order by b.code, rc.name
             )
      from room_categories rc
      join branches b on b.id = rc.branch_id
      left join loyalty_category_rates r on r.category_id = rc.id
    ), '[]'::jsonb),
    'rewards', coalesce((
      select jsonb_agg(
               jsonb_build_object('points', w.points, 'label', w.label)
               order by w.sort_order, w.points
             )
      from loyalty_rewards w
    ), '[]'::jsonb)
  );
end;
$$;

-- ---- Management: save all programme settings in one go ----
create or replace function save_loyalty_settings(input_mgmt_pin text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_earn numeric;
  v_value numeric;
  v_expiry integer;
  v_large integer;
  item jsonb;
begin
  perform assert_management(input_mgmt_pin);

  v_earn := (payload->>'earn_percent')::numeric;
  v_value := (payload->>'point_value_kes')::numeric;
  v_expiry := (payload->>'expiry_months')::integer;
  v_large := (payload->>'large_redemption_points')::integer;

  if v_earn is null or v_earn < 0 or v_earn > 100 then
    raise exception 'Earn percentage must be between 0 and 100';
  end if;
  if v_value is null or v_value <= 0 then
    raise exception 'Value of one point must be more than 0';
  end if;
  if v_expiry is null or v_expiry < 0 then
    raise exception 'Expiry months cannot be negative';
  end if;
  if v_large is null or v_large < 0 then
    raise exception 'Large redemption flag cannot be negative';
  end if;

  update loyalty_settings
  set earn_percent = v_earn,
      point_value_kes = v_value,
      expiry_months = v_expiry,
      large_redemption_points = v_large,
      updated_at = now()
  where id = true;

  -- Nightly rates: a blank rate clears that category's rate.
  for item in select value from jsonb_array_elements(coalesce(payload->'rates', '[]'::jsonb)) loop
    if coalesce(trim(item->>'rate'), '') = '' then
      delete from loyalty_category_rates where category_id = (item->>'category_id')::uuid;
    else
      if (item->>'rate')::numeric < 0 then
        raise exception 'Nightly rates cannot be negative';
      end if;
      insert into loyalty_category_rates (category_id, rate_per_night_kes)
      values ((item->>'category_id')::uuid, (item->>'rate')::numeric)
      on conflict (category_id)
      do update set rate_per_night_kes = excluded.rate_per_night_kes, updated_at = now();
    end if;
  end loop;

  -- Rewards: the saved list replaces the old one.
  delete from loyalty_rewards where id is not null;
  insert into loyalty_rewards (points, label, sort_order)
  select (e.value->>'points')::integer, trim(e.value->>'label'), (e.ord - 1)::integer
  from jsonb_array_elements(coalesce(payload->'rewards', '[]'::jsonb)) with ordinality as e(value, ord)
  where coalesce(trim(e.value->>'label'), '') <> '';
end;
$$;

grant execute on function get_loyalty_settings(text) to anon;
grant execute on function save_loyalty_settings(text, jsonb) to anon;

notify pgrst, 'reload schema';

-- ============================================================
-- Paradise Voices - Resolved feedback
-- Management can mark feedback that needed attention as resolved
-- (with a short note) and reopen it again. Safe to run more than once.
-- ============================================================

alter table feedback
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_note text;

-- Guests may only submit open (unresolved) feedback.
drop policy if exists "anyone can submit feedback" on feedback;
create policy "anyone can submit feedback" on feedback
  for insert
  with check (resolved_at is null and resolved_note is null);

create or replace function resolve_feedback(
  input_mgmt_pin text,
  input_feedback_id uuid,
  input_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_management(input_mgmt_pin);

  if input_note is null or char_length(trim(input_note)) < 3 then
    raise exception 'Please say briefly what was done (at least 3 characters)';
  end if;

  update feedback
  set resolved_at = now(),
      resolved_note = trim(input_note)
  where id = input_feedback_id;

  if not found then
    raise exception 'Feedback not found';
  end if;
end;
$$;

create or replace function reopen_feedback(
  input_mgmt_pin text,
  input_feedback_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_management(input_mgmt_pin);

  update feedback
  set resolved_at = null,
      resolved_note = null
  where id = input_feedback_id;

  if not found then
    raise exception 'Feedback not found';
  end if;
end;
$$;

grant execute on function resolve_feedback(text, uuid, text) to anon;
grant execute on function reopen_feedback(text, uuid) to anon;

notify pgrst, 'reload schema';

-- ============================================================
-- PIN safety
-- Two logins sharing one PIN made verify_pin() return two rows, so the
-- app could pick the wrong role. This stops a PIN being reused and makes
-- sure it is exactly 4 digits. Safe to run more than once.
-- ============================================================

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
  perform assert_management(input_mgmt_pin);

  if new_pin is not null then
    if new_pin !~ '^[0-9]{4}$' then
      raise exception 'A PIN must be exactly 4 digits';
    end if;
    if exists (select 1 from staff_roles where pin = new_pin and role_key <> target_role_key) then
      raise exception 'That PIN is already used by another login. Choose a different one.';
    end if;
  end if;

  update staff_roles
  set pin = coalesce(new_pin, pin),
      display_name = coalesce(new_display_name, display_name)
  where role_key = target_role_key;
end;
$$;

grant execute on function update_staff_credentials(text, text, text, text) to anon;

notify pgrst, 'reload schema';

-- ============================================================
-- Wifi connection and speed rating
-- Optional 1-5 star rating, like Facilities and Value. Older feedback
-- simply has no Wifi score. Safe to run more than once.
-- ============================================================

alter table feedback
  add column if not exists wifi_rating smallint
  check (wifi_rating is null or wifi_rating between 1 and 5);

notify pgrst, 'reload schema';

-- ============================================================
-- Paper feedback entry (temporary)
-- Lets reception type in paper forms under the date written on them.
-- Management switches it on and off in Staff Settings.
-- Safe to run more than once.
-- ============================================================

begin;

-- Earlier blocks' columns, in case they have not been run yet.
alter table feedback add column if not exists wifi_rating smallint
  check (wifi_rating is null or wifi_rating between 1 and 5);
alter table feedback add column if not exists resolved_at timestamptz;
alter table feedback add column if not exists resolved_note text;

-- When a paper form was actually typed in (empty for normal responses).
alter table feedback add column if not exists entered_at timestamptz;

-- Allow 'paper' as a source. The old rule is found by its column, so its
-- name does not matter (and the referral_source rule is left alone).
do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attname = 'source'
    where c.conrelid = 'feedback'::regclass
      and c.contype = 'c'
      and c.conkey = array[a.attnum]
  loop
    execute format('alter table feedback drop constraint %I', con.conname);
  end loop;
end;
$$;

alter table feedback add constraint feedback_source_check
  check (source in ('tablet','room_qr','reception_qr','paper'));

-- Normal responses are always dated now and start unresolved. Only
-- submit_paper_feedback() below can save an earlier date, so the switch
-- cannot be bypassed.
drop policy if exists "anyone can submit feedback" on feedback;
create policy "anyone can submit feedback" on feedback for insert
  with check (
    source <> 'paper' and entered_at is null and created_at = now()
    and resolved_at is null and resolved_note is null
  );

-- Paper forms from one day share a timestamp. Sorting by id as well keeps
-- the dashboard's page-by-page loading from skipping any of them.
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
  return query select * from feedback order by created_at desc, id;
end;
$$;

-- ---- The on/off switch (always exactly one row, off at first) ----
create table if not exists paper_entry_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false
);

insert into paper_entry_settings (id) values (true) on conflict (id) do nothing;

alter table paper_entry_settings enable row level security;

create or replace function paper_entry_status(input_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from staff_roles where pin = input_pin) then
    raise exception 'Invalid PIN';
  end if;
  return coalesce((select enabled from paper_entry_settings), false);
end;
$$;

create or replace function set_paper_entry_enabled(input_mgmt_pin text, input_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_management(input_mgmt_pin);
  update paper_entry_settings set enabled = coalesce(input_enabled, false) where id;
  return coalesce(input_enabled, false);
end;
$$;

-- Saves one paper form. Returns 'saved', 'already_saved' (same form sent
-- twice) or 'duplicate' (looks like one already entered; send force to save).
create or replace function submit_paper_feedback(input_pin text, payload jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch uuid;
  v_id uuid := (payload->>'id')::uuid;
  v_room uuid := (payload->>'room_id')::uuid;
  v_date date := (payload->>'visit_date')::date;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_created timestamptz;
  v_comment text := nullif(btrim(payload->>'comment'), '');
  v_mentions uuid[];
begin
  select sr.branch_id into v_branch
  from staff_roles sr
  where sr.pin = input_pin and sr.role_key <> 'management' and sr.branch_id is not null
  limit 1;
  if v_branch is null then
    raise exception 'Invalid reception PIN';
  end if;

  if not coalesce((select enabled from paper_entry_settings), false) then
    raise exception 'Paper feedback entry is switched off';
  end if;
  if v_id is null then
    raise exception 'Missing form id';
  end if;
  if exists (select 1 from feedback where id = v_id and source = 'paper' and branch_id = v_branch) then
    return 'already_saved';
  end if;
  if v_date is null then
    raise exception 'Enter the date on the paper';
  end if;
  if v_date > v_today then
    raise exception 'The date cannot be in the future';
  end if;
  if v_date < (v_today - interval '2 years')::date then
    raise exception 'The date cannot be more than 2 years ago';
  end if;
  if v_room is null or not exists (select 1 from rooms where id = v_room and branch_id = v_branch) then
    raise exception 'Choose a room in this branch';
  end if;

  select coalesce(array_agg(distinct m::uuid), '{}') into v_mentions
  from jsonb_array_elements_text(coalesce(payload->'mentions', '[]'::jsonb)) as m;

  if (select count(*) from team_members where id = any(v_mentions) and branch_id = v_branch)
     <> cardinality(v_mentions) then
    raise exception 'The staff list has changed. Re-enter your PIN and try again';
  end if;

  -- Noon in Nairobi, but never later than the present moment.
  v_created := least((v_date + time '12:00') at time zone 'Africa/Nairobi', now());

  if not coalesce((payload->>'force')::boolean, false) and exists (
    select 1 from feedback f
    where f.source = 'paper'
      and f.room_id = v_room
      and (f.created_at at time zone 'Africa/Nairobi')::date = v_date
      and f.front_office_rating is not distinct from (payload->>'front_office_rating')::smallint
      and f.housekeeping_rating is not distinct from (payload->>'housekeeping_rating')::smallint
      and f.room_comfort_rating is not distinct from (payload->>'room_comfort_rating')::smallint
      and f.facilities_rating is not distinct from (payload->>'facilities_rating')::smallint
      and f.wifi_rating is not distinct from (payload->>'wifi_rating')::smallint
      and f.value_rating is not distinct from (payload->>'value_rating')::smallint
      and f.overall_rating is not distinct from (payload->>'overall_rating')::smallint
      and f.comment is not distinct from v_comment
  ) then
    return 'duplicate';
  end if;

  insert into feedback (
    id, created_at, entered_at, source, branch_id, room_id,
    front_office_rating, housekeeping_rating, room_comfort_rating,
    facilities_rating, wifi_rating, value_rating, overall_rating,
    nps, referral_source, comment, guest_name, guest_contact
  ) values (
    v_id, v_created, now(), 'paper', v_branch, v_room,
    (payload->>'front_office_rating')::smallint,
    (payload->>'housekeeping_rating')::smallint,
    (payload->>'room_comfort_rating')::smallint,
    (payload->>'facilities_rating')::smallint,
    (payload->>'wifi_rating')::smallint,
    (payload->>'value_rating')::smallint,
    (payload->>'overall_rating')::smallint,
    (payload->>'nps')::smallint,
    payload->>'referral_source',
    v_comment,
    nullif(btrim(payload->>'guest_name'), ''),
    nullif(btrim(payload->>'guest_contact'), '')
  );

  insert into feedback_mentions (feedback_id, team_member_id)
  select v_id, m from unnest(v_mentions) as m;

  return 'saved';
end;
$$;

grant execute on function paper_entry_status(text) to anon;
grant execute on function set_paper_entry_enabled(text, boolean) to anon;
grant execute on function submit_paper_feedback(text, jsonb) to anon;

commit;

notify pgrst, 'reload schema';

-- Check: this should list exactly ONE policy for feedback.
select policyname, cmd, with_check from pg_policies
where schemaname = 'public' and tablename = 'feedback' and cmd in ('INSERT', 'ALL');
