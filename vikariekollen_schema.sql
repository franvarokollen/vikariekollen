-- ============================================================================
-- Vikariekollen — substitute offer & booking engine
-- Bolts onto Frånvarokollen baseline (schools, users, external_subs,
-- cover_records, absence_periods, cover_assignments, lessons, school_settings).
--
-- Conventions matched from baseline.sql:
--   * uuid ids via gen_random_uuid()
--   * school_id tenancy, ON DELETE CASCADE to schools
--   * timestamptz columns default now()
--   * text columns with CHECK enums
--   * RLS via school_isolation USING (school_id = get_user_school_id())
--   * NO anon/authenticated broad policies — portal reads only; the external
--     accept/decline path goes through SECURITY DEFINER RPCs, never RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Per-school cover configuration — THREE INDEPENDENT AXES
--
--   cover_offer_mode    DISTRIBUTION method: how an offer is delivered once a
--                       candidate pool is chosen.
--                         admin_assign | open_pool | cascade
--   cover_source_mode   POOL policy: which candidate pool(s) and in what
--                       priority. Read by the matcher (see §4).
--                         internal_first | external_first
--                         | internal_only | external_only | both
--                       DEFAULT internal_first — fill from your own staff's
--                       free periods before paying an agency sub.
--   automation_level    How much the engine acts on its own. Consumed by the
--                       offer lifecycle / portal (auto-trigger sends, etc.);
--                       for now it is stored and surfaced, full auto wiring is
--                       a later step.
--                         manual | assisted | auto    DEFAULT assisted
-- ----------------------------------------------------------------------------
alter table public.school_settings
  add column if not exists cover_offer_mode text not null default 'cascade'
    check (cover_offer_mode in ('admin_assign', 'open_pool', 'cascade'));

alter table public.school_settings
  add column if not exists cover_offer_step_minutes int not null default 15
    check (cover_offer_step_minutes between 1 and 20160);  -- cascade timeout per sub: 1 min (urgent) .. 20160 min (14 days)

-- LEGACY / DERIVED. cover_source_mode is no longer the matcher's source of
-- truth — cover_source_tiers below is. It is kept so legacy readers still get
-- a sane single-value label; the Adapter derives it from the tier order on
-- write (internal tier above the external tiers → 'internal_first', only
-- internal enabled → 'internal_only', etc.).
alter table public.school_settings
  add column if not exists cover_source_mode text not null default 'internal_first'
    check (cover_source_mode in ('internal_first', 'external_first',
                                 'internal_only', 'external_only', 'both'));

-- COVER-SOURCE TIERS — the ORDERED, TOGGLEABLE candidate-pool config that is
-- the matcher's source of truth. A JSON array of { key, enabled } over EXACTLY
-- the four pool keys, each once, in priority order (index 0 = contacted first):
--     internal_staff  = staff_members (free-period cover)
--     fvk_active      = external_subs with origin='fvk' AND active=true
--     vk_subs         = external_subs with origin='vk'  (active by default)
--     fvk_inactive    = external_subs with origin='fvk' AND active=false
-- DEFAULT: staff first, then active FVK subs, then VK subs, with inactive FVK
-- subs LAST and OFF (last-resort pool). Validation (4 keys, once each, boolean
-- enabled, no dupes/unknowns) is enforced by the Adapter / portal write path; a
-- jsonb CHECK could mirror it but is intentionally omitted for editor freedom.
alter table public.school_settings
  add column if not exists cover_source_tiers jsonb not null default
    '[{"key":"internal_staff","enabled":true},
      {"key":"fvk_active","enabled":true},
      {"key":"vk_subs","enabled":true},
      {"key":"fvk_inactive","enabled":false}]'::jsonb;

alter table public.school_settings
  add column if not exists cover_automation_level text not null default 'assisted'
    check (cover_automation_level in ('manual', 'assisted', 'auto'));

-- If true, a substitute is shown how long an offer sat with them before it
-- moved on (retrospective). Off by default — it's a judgement call (can nudge
-- faster replies but may feel like pressure).
alter table public.school_settings
  add column if not exists show_sub_wait_time boolean not null default false;

-- ----------------------------------------------------------------------------
-- 0b. external_subs pool attributes — ONE sub record + attributes (NOT four
--     tables). The four contactable pools are SLICES over these columns:
--       origin  'fvk' (created in Frånvarokollen) | 'vk' (created in
--               Vikariekollen). DEFAULT 'fvk' so pre-existing rows land in the
--               historical pool.
--       active  the FVK activate toggle. fvk_active vs fvk_inactive is decided
--               by this flag; VK subs are treated active by default. This is
--               SEPARATE from sub_activations (per-date availability) — an
--               inactive sub is simply a lower-tier pool, still date-gated.
-- ----------------------------------------------------------------------------
alter table public.external_subs
  add column if not exists origin text not null default 'fvk'
    check (origin in ('fvk', 'vk'));

alter table public.external_subs
  add column if not exists active boolean not null default true;

-- ----------------------------------------------------------------------------
-- 0c. school_subjects — the per-school, MUTABLE subject catalogue the matcher
--     reads to decide QUALIFICATION. Two kinds of entry:
--       type 'teaching' — a curriculum subject. A gap in this subject REQUIRES
--                         qualification (candidate.subjects must include it).
--       type 'duty'     — a NON-TEACHING DUTY (Rastvakt/break duty, Lunchvakt,
--                         Studiehandledning, Specialpedagogik-stöd, Fritids,
--                         …). A gap whose subject matches a duty entry REQUIRES
--                         NO qualification — every candidate is qualified.
--     Seeded from a canonical Swedish curriculum list + the duty list, then
--     editable in the portal (add/remove). In the prototype this lives in the
--     Adapter's vk_subjects localStorage store with the same { name, type }
--     shape; this table is the live-backend equivalent.
-- ----------------------------------------------------------------------------
create table if not exists public.school_subjects (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  name       text not null,
  type       text not null default 'teaching'
               check (type in ('teaching', 'duty')),
  created_at timestamptz not null default now(),
  -- case-insensitive uniqueness per school (mirrors the Adapter's dupe check)
  unique (school_id, name)
);
create unique index if not exists idx_school_subjects_ci
  on public.school_subjects (school_id, lower(name));
create index if not exists idx_school_subjects_school
  on public.school_subjects(school_id);

alter table public.school_subjects enable row level security;
create policy school_isolation on public.school_subjects
  using (school_id = public.get_user_school_id());

-- ----------------------------------------------------------------------------
-- 1. cover_offers — one row per gap that needs filling
--    Linked to the absence that created it; can target a single slot or a
--    whole absence period. mode is copied from school_settings at creation so
--    a school can flip its default without rewriting open offers.
-- ----------------------------------------------------------------------------
create table if not exists public.cover_offers (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  cover_record_id   uuid references public.cover_records(id) on delete cascade,
  absence_period_id uuid references public.absence_periods(id) on delete cascade,
  date              date not null,
  start_time        text,                    -- "HH:MM"; null = full day
  end_time          text,
  subject           text,                    -- matched against external_subs.subjects
  group_name        text,                    -- class, for the sub's context
  mode              text not null
                      check (mode in ('admin_assign', 'open_pool', 'cascade')),
  status            text not null default 'open'
                      check (status in ('open', 'filled', 'expired', 'cancelled')),
  -- who filled it — POLYMORPHIC. filled_by_sub_id is retained as the external
  -- read-compat alias (set only when filled_by_type = 'external_sub').
  filled_by_type    text check (filled_by_type in ('external_sub', 'staff')),
  filled_by_id      uuid,                    -- external_subs.id OR staff_members.id
  filled_by_sub_id  uuid references public.external_subs(id) on delete set null,
  fill_assignment_id uuid references public.cover_assignments(id) on delete set null,
  expires_at        timestamptz,             -- hard deadline for the whole offer
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  filled_at         timestamptz,
  -- at least one anchor to an absence so an offer is never orphaned
  constraint cover_offers_has_anchor
    check (cover_record_id is not null or absence_period_id is not null)
);

create index if not exists idx_cover_offers_school   on public.cover_offers(school_id);
create index if not exists idx_cover_offers_status   on public.cover_offers(school_id, status);
create index if not exists idx_cover_offers_date     on public.cover_offers(school_id, date);

-- ----------------------------------------------------------------------------
-- 2. cover_offer_targets — fan-out, one row per CANDIDATE contacted for an
--    offer. POLYMORPHIC RECIPIENT: a candidate is either an EXTERNAL SUB or an
--    INTERNAL STAFF MEMBER, addressed by (recipient_type, recipient_id):
--        recipient_type = 'external_sub' → recipient_id → external_subs.id
--        recipient_type = 'staff'        → recipient_id → staff_members.id
--    There is no single FK (the target spans two tables); integrity is enforced
--    by the matcher/RPCs and an optional trigger could validate it. A generated
--    `sub_id` column is kept as a READ-COMPAT alias: it equals recipient_id for
--    external targets and NULL for staff, so legacy readers/joins on sub_id and
--    the idx_cot_sub index keep working.
--
--    rank drives cascade order (1 = contacted first). For open_pool every
--    target is sent at once; for cascade they're released rank by rank.
--    response_token lets an external sub (no auth.users row) accept/decline via
--    a tokenized link; internal staff accept/decline in-portal (or via token).
-- ----------------------------------------------------------------------------
create table if not exists public.cover_offer_targets (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  offer_id        uuid not null references public.cover_offers(id) on delete cascade,
  recipient_type  text not null default 'external_sub'
                    check (recipient_type in ('external_sub', 'staff')),
  recipient_id    uuid not null,                     -- external_subs.id OR staff_members.id
  -- read-compat alias: external → recipient_id, staff → NULL
  sub_id          uuid generated always as
                    (case when recipient_type = 'external_sub' then recipient_id end) stored,
  rank            int  not null default 1,           -- cascade ordering
  channel         text not null default 'sms'
                    check (channel in ('sms', 'email', 'push')),
  response_token  uuid not null default gen_random_uuid(),
  state           text not null default 'pending'
                    check (state in ('pending', 'sent', 'accepted',
                                     'declined', 'expired', 'superseded')),
  sent_at         timestamptz,
  responded_at    timestamptz,
  step_expires_at timestamptz,               -- cascade per-recipient timeout
  created_at      timestamptz not null default now(),
  unique (offer_id, recipient_type, recipient_id)
);

create index if not exists idx_cot_school     on public.cover_offer_targets(school_id);
create index if not exists idx_cot_offer      on public.cover_offer_targets(offer_id, rank);
create index if not exists idx_cot_token      on public.cover_offer_targets(response_token);
create index if not exists idx_cot_recipient  on public.cover_offer_targets(recipient_type, recipient_id, state);
create index if not exists idx_cot_sub        on public.cover_offer_targets(sub_id, state);

-- ----------------------------------------------------------------------------
-- 3. RLS — school-isolated portal reads only. No anon/authenticated policies.
--    External subs never touch these tables directly; they go through the
--    SECURITY DEFINER RPCs in section 5.
-- ----------------------------------------------------------------------------
alter table public.cover_offers        enable row level security;
alter table public.cover_offer_targets enable row level security;

create policy school_isolation on public.cover_offers
  using (school_id = public.get_user_school_id());

create policy school_isolation on public.cover_offer_targets
  using (school_id = public.get_user_school_id());

-- ----------------------------------------------------------------------------
-- 4. Matching — POLYMORPHIC candidates for an offer (internal staff + subs).
--    Returns the unified candidate shape the portal expects:
--      recipient_type ('external_sub'|'staff'), recipient_id, source
--      ('internal'|'external'), name, email, rate, qualified (bool),
--      reliability_score, workload_pct (staff only), rank.
--
--    SUBJECT QUALIFICATION IS SOFT FOR BOTH POOLS. A subject mismatch NEVER
--    excludes a candidate — it is returned as qualified=false so the portal
--    can flag "ej behörig" / "not qualified", and it ranks BELOW qualified
--    candidates within the same tier. qualified is true when the gap needs no
--    qualification (no subject, OR the subject is a DUTY in school_subjects)
--    OR the candidate's subjects[] include the gap subject.
--
--    EXTERNAL SUB filters: same school, available that weekday, activated for
--      the date, not already confirmed on an overlapping cover_assignment.
--      (The old subject-competence HARD filter is REMOVED — now soft/qualified.)
--    INTERNAL STAFF filters: role in (coverable,teaching), a FREE PERIOD at
--      the gap time (no lesson overlapping start/end that date), and under
--      their monthly cover limit. Subject competence was already a boost.
--
--    DUTY DETECTION: the gap subject is a duty iff it matches a school_subjects
--    row with type='duty'. A duty gap ⇒ qualified=true for everyone.
--
--    POOLING is governed by school_settings.cover_source_tiers (the ordered,
--    toggleable four-pool config — the SOURCE OF TRUTH). The portal Adapter
--    computes the live tier ranking:
--      * each candidate gets a tier: staff → internal_staff; external sub →
--        fvk_active / vk_subs / fvk_inactive by (origin, active);
--      * tiers with enabled=false are EXCLUDED;
--      * rank = enabled-tier index FIRST, then qualified DESC (qualified above
--        unqualified within a tier), then reliability desc → rate asc →
--        workload asc → name.
--    The cover_source_mode column below is a DERIVED legacy label only. The SQL
--    here keeps the older source_mode weighting as a reference fallback; port
--    it to the tier model when this RPC becomes the live matcher.
--
--    NOTE: external reliability_score is a placeholder 50 until the audit
--    pipeline feeds it; the portal Adapter computes the live score from the
--    audit log. staff_members is assumed to carry subjects[], internal_rate,
--    cover_limit_per_month and a teaching schedule joinable via lessons /
--    staff_schedule (adjust the staff lesson-overlap subquery to the real
--    staff timetable table name in this deployment).
-- ----------------------------------------------------------------------------
create or replace function public.match_cover_candidates(p_offer_id uuid)
returns table (recipient_type text, recipient_id uuid, source text,
               name text, email text, rate int, qualified boolean,
               reliability_score int, workload_pct int, rank int)
language sql
security definer
set search_path = public
as $$
  with o as (
    select * from cover_offers where id = p_offer_id
  ),
  cfg as (
    select coalesce(ss.cover_source_mode, 'internal_first') as source_mode
    from o left join school_settings ss on ss.school_id = o.school_id
  ),
  -- does the gap require qualification? false when no subject OR the subject
  -- is a DUTY in school_subjects (duty ⇒ everyone qualified).
  req as (
    select (o.subject is not null
            and not exists (
              select 1 from school_subjects ss
              where ss.school_id = o.school_id
                and ss.type = 'duty'
                and lower(ss.name) = lower(o.subject))) as needs_qual
    from o
  ),
  -- external candidates. SUBJECT IS NO LONGER A HARD FILTER — it only
  -- decides `qualified`.
  ext as (
    select 'external_sub'::text as recipient_type,
           s.id as recipient_id, 'external'::text as source,
           s.name, s.email, coalesce(s.hourly_rate, 0) as rate,
           50 as reliability_score, null::int as workload_pct,
           (not (select needs_qual from req)
            or o.subject = any (s.subjects)) as qualified
    from external_subs s, o
    where s.school_id = o.school_id
      and (to_char(o.date, 'Dy') = any (s.available_days)
           or array_length(s.available_days, 1) is null)
      and exists (select 1 from sub_activations a
                   where a.sub_id = s.id and a.date = o.date)
      and not exists (
        select 1 from cover_assignments ca
        where ca.school_id = o.school_id and ca.date = o.date
          and ca.is_external and ca.is_confirmed
          and ca.cover_teacher = s.name)
  ),
  -- internal staff candidates (free-period + under monthly cover limit)
  stf as (
    select 'staff'::text as recipient_type,
           m.id as recipient_id, 'internal'::text as source,
           m.display_name as name, m.email,
           coalesce(m.internal_rate, 0) as rate,
           60 as reliability_score,
           (case when coalesce(m.cover_limit_per_month, 0) > 0
                 then least(100, round(100.0 *
                      (select count(*) from cover_assignments ca
                        where ca.school_id = o.school_id
                          and not ca.is_external
                          and date_trunc('month', ca.date) = date_trunc('month', o.date)
                          and ca.cover_teacher = m.display_name)
                      / m.cover_limit_per_month))::int
                 else 0 end) as workload_pct,
           (not (select needs_qual from req)
            or o.subject = any (m.subjects)) as qualified
    from staff_members m, o
    where m.school_id = o.school_id
      and m.role in ('coverable', 'teaching')
      -- FREE PERIOD: no lesson for this member overlaps the gap window.
      -- Adjust `lessons` join to the real staff-timetable source if different.
      and not exists (
        select 1 from lessons l
        where l.school_id = o.school_id
          and l.date = o.date
          and l.teacher_staff_id = m.id
          and (o.start_time is null or
               (l.start_time < o.end_time and o.start_time < l.end_time)))
      -- under monthly cover limit
      and coalesce(m.cover_limit_per_month, 0) > 0
      and (select count(*) from cover_assignments ca
            where ca.school_id = o.school_id
              and not ca.is_external
              and date_trunc('month', ca.date) = date_trunc('month', o.date)
              and ca.cover_teacher = m.display_name) < m.cover_limit_per_month
  ),
  pool as (
    select * from ext
     where (select source_mode from cfg) <> 'internal_only'
    union all
    select * from stf
     where (select source_mode from cfg) <> 'external_only'
  )
  select p.recipient_type, p.recipient_id, p.source,
         p.name, p.email, p.rate, p.qualified,
         p.reliability_score, p.workload_pct,
         row_number() over (
           order by
             -- source priority for *_first modes (0 first)
             case (select source_mode from cfg)
               when 'internal_first' then (case when p.source = 'internal' then 0 else 1 end)
               when 'external_first' then (case when p.source = 'external' then 0 else 1 end)
               else 0 end asc,
             p.qualified desc,            -- qualified above unqualified in-tier
             p.reliability_score desc,
             p.rate asc,
             coalesce(p.workload_pct, 0) asc,
             p.name asc
         )::int as rank
  from pool p;
$$;

-- ----------------------------------------------------------------------------
-- 5a. accept_cover_offer — the concurrency-critical path.
--     Called by the edge function with a target's response_token. Locks the
--     offer row FOR UPDATE so two simultaneous accepts can't both win
--     (first-to-accept). On success: marks offer filled, writes the
--     cover_assignment back into Frånvarokollen, links absence_period, and
--     supersedes all other targets. Returns the new assignment id.
-- ----------------------------------------------------------------------------
create or replace function public.accept_cover_offer(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target  cover_offer_targets%rowtype;
  v_offer   cover_offers%rowtype;
  v_name    text;
  v_cost    int;
  v_is_external boolean;
  v_assignment_id uuid;
begin
  -- resolve token -> target
  select * into v_target from cover_offer_targets where response_token = p_token;
  if not found then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;

  -- lock the offer; serialize concurrent accepts on the same gap
  select * into v_offer from cover_offers where id = v_target.offer_id for update;

  if v_offer.status <> 'open' then
    -- someone already won, or it was cancelled/expired
    raise exception 'offer_closed' using errcode = 'P0001';
  end if;

  if v_target.state in ('expired', 'superseded', 'declined') then
    raise exception 'target_inactive' using errcode = 'P0001';
  end if;

  -- resolve the POLYMORPHIC recipient → name + cost + pool flag
  if v_target.recipient_type = 'staff' then
    select m.display_name, coalesce(m.internal_rate, 0)
      into v_name, v_cost
      from staff_members m where m.id = v_target.recipient_id;
    v_is_external := false;
  else
    select s.name, coalesce(s.hourly_rate, 0)
      into v_name, v_cost
      from external_subs s where s.id = v_target.recipient_id;
    v_is_external := true;
  end if;

  -- write the cover assignment back into Frånvarokollen
  insert into cover_assignments
    (school_id, cover_record_id, date, cover_teacher, subject,
     cost_sek, is_external, is_confirmed, assigned_at)
  values
    (v_offer.school_id, v_offer.cover_record_id, v_offer.date,
     v_name, v_offer.subject, v_cost, v_is_external, true, now())
  returning id into v_assignment_id;

  -- mark the offer filled (polymorphic + external compat alias)
  update cover_offers
     set status = 'filled',
         filled_by_type = v_target.recipient_type,
         filled_by_id = v_target.recipient_id,
         filled_by_sub_id = case when v_is_external then v_target.recipient_id end,
         fill_assignment_id = v_assignment_id,
         filled_at = now()
   where id = v_offer.id;

  -- link the absence period if this offer was period-anchored (external only;
  -- covering_sub_id references external_subs — staff covers leave it null).
  if v_offer.absence_period_id is not null and v_is_external then
    update absence_periods
       set covering_sub_id = v_target.recipient_id
     where id = v_offer.absence_period_id;
  end if;

  -- accept the winning target, supersede the rest
  update cover_offer_targets
     set state = 'accepted', responded_at = now()
   where id = v_target.id;

  update cover_offer_targets
     set state = 'superseded'
   where offer_id = v_offer.id
     and id <> v_target.id
     and state in ('pending', 'sent');

  return v_assignment_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5b. decline_cover_offer — sub passes. In cascade mode the edge function
--     reads the next-ranked pending target and releases it.
-- ----------------------------------------------------------------------------
create or replace function public.decline_cover_offer(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target cover_offer_targets%rowtype;
begin
  select * into v_target from cover_offer_targets where response_token = p_token;
  if not found then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;
  if v_target.state not in ('sent', 'pending') then
    raise exception 'target_inactive' using errcode = 'P0001';
  end if;

  update cover_offer_targets
     set state = 'declined', responded_at = now()
   where id = v_target.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5c. admin_assign_cover — controller mode. Coordinator picks a candidate
--     directly (external sub OR internal staff); no fan-out. Runs under the
--     caller's session so RLS + role still apply, then reuses the same
--     polymorphic write-back as the accept path.
--
--     Back-compat: the old 2-arg signature admin_assign_cover(offer, sub) is
--     preserved as a thin wrapper that assumes recipient_type='external_sub'.
-- ----------------------------------------------------------------------------
create or replace function public.admin_assign_cover(
  p_offer_id uuid, p_recipient_type text, p_recipient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer cover_offers%rowtype;
  v_name  text;
  v_cost  int;
  v_is_external boolean;
  v_assignment_id uuid;
begin
  select * into v_offer from cover_offers where id = p_offer_id for update;
  if not found or v_offer.school_id <> public.get_user_school_id() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'open' then
    raise exception 'offer_closed' using errcode = 'P0001';
  end if;

  if p_recipient_type = 'staff' then
    select m.display_name, coalesce(m.internal_rate, 0)
      into v_name, v_cost
      from staff_members m
     where m.id = p_recipient_id and m.school_id = v_offer.school_id;
    v_is_external := false;
  else
    select s.name, coalesce(s.hourly_rate, 0)
      into v_name, v_cost
      from external_subs s
     where s.id = p_recipient_id and s.school_id = v_offer.school_id;
    v_is_external := true;
  end if;
  if not found then
    raise exception 'recipient_not_found' using errcode = 'P0002';
  end if;

  insert into cover_assignments
    (school_id, cover_record_id, date, cover_teacher, subject,
     cost_sek, is_external, is_confirmed, assigned_at)
  values
    (v_offer.school_id, v_offer.cover_record_id, v_offer.date,
     v_name, v_offer.subject, v_cost, v_is_external, true, now())
  returning id into v_assignment_id;

  update cover_offers
     set status = 'filled',
         filled_by_type = p_recipient_type,
         filled_by_id = p_recipient_id,
         filled_by_sub_id = case when v_is_external then p_recipient_id end,
         fill_assignment_id = v_assignment_id, filled_at = now()
   where id = v_offer.id;

  if v_offer.absence_period_id is not null and v_is_external then
    update absence_periods set covering_sub_id = p_recipient_id
     where id = v_offer.absence_period_id;
  end if;

  update cover_offer_targets
     set state = 'superseded'
   where offer_id = v_offer.id and state in ('pending', 'sent');

  return v_assignment_id;
end;
$$;

-- back-compat 2-arg wrapper (external sub)
create or replace function public.admin_assign_cover(p_offer_id uuid, p_sub_id uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.admin_assign_cover(p_offer_id, 'external_sub', p_sub_id);
$$;

-- ----------------------------------------------------------------------------
-- 6. Lektionskollen lesson-plan attach seam
--
--    Vikariekollen surfaces a lesson plan alongside each booked cover. In the
--    prototype this is a MOCK HOOK: the Adapter resolves a plan at booking-read
--    time by matching gap.subject (case-insensitive) against a local plan bank
--    constant (_LEKTIONSKOLLEN_PLANS), returning { title, url, source:'Lektionskollen' }
--    or null. No new VK table is required.
--
--    In production the seam works as follows:
--
--    1. Plan storage lives in the LEKTIONSKOLLEN system (its own schema/DB).
--       Lektionskollen owns lektionskollen_plans { id, school_id, subject,
--       group_pattern, period_pattern, title, url, author, ... }.
--
--    2. At booking/read time the Vikariekollen portal calls a Lektionskollen
--       API (or a cross-schema RPC) keyed by (school_id, subject, [group],
--       [period]) to resolve the best-matching plan. The resolved { title, url }
--       is returned in-line alongside the cover_assignment — no copy is stored
--       in VK's schema.
--
--    3. Optional: a denormalised lektionskollen_plan_id column on
--       cover_assignments / cover_offers stores the winner so the link survives
--       even if the Lektionskollen catalogue changes. Add it here when the
--       integration is live:
--
--         alter table public.cover_assignments
--           add column if not exists lektionskollen_plan_id uuid;
--         alter table public.cover_offers
--           add column if not exists lektionskollen_plan_id uuid;
--
--    4. The adapter shape the UI reads is stable:
--         booking.lessonPlan  →  { title, url, source:'Lektionskollen' } | null
--       Switching from the mock plan bank to a live API call is a one-file
--       change: replace the body of _getLessonPlanForSubject() in adapter.js.
--
--    No table DDL is added here; this comment block documents the integration
--    contract so the Lektionskollen team has a defined seam to fill in.
-- ----------------------------------------------------------------------------
