-- TSS V29 — Autorizações, exceções e registros de acesso

create table if not exists public.tss_authorization_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  person_id uuid not null references public.tss_people(id) on delete cascade,
  access_type_id uuid not null references public.tss_access_types(id) on delete restrict,
  unit_id uuid not null references public.tss_units(id) on delete restrict,
  area_id uuid references public.tss_areas(id) on delete restrict,
  visit_purpose_id uuid references public.tss_visit_purposes(id) on delete set null,
  host_user_id uuid references auth.users(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  reason text,
  status text not null default 'PENDING' check (status in ('PENDING','UNDER_REVIEW','APPROVED','REJECTED','CANCELLED','EXPIRED')),
  decision_notes text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until > valid_from)
);

drop trigger if exists trg_tss_authorization_requests_updated_at on public.tss_authorization_requests;
create trigger trg_tss_authorization_requests_updated_at before update on public.tss_authorization_requests
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_authorization_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  authorization_request_id uuid not null references public.tss_authorization_requests(id) on delete cascade,
  approval_step text not null,
  approver_user_id uuid references auth.users(id) on delete set null,
  sequence_order integer not null default 1 check (sequence_order > 0),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','SKIPPED')),
  notes text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (authorization_request_id, approval_step)
);

create table if not exists public.tss_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  person_id uuid not null references public.tss_people(id) on delete cascade,
  authorization_request_id uuid references public.tss_authorization_requests(id) on delete set null,
  exception_type text not null check (exception_type in ('DOCUMENT','TRAINING','AUTHORIZATION','ACCESS_POLICY','OTHER')),
  reference_id uuid,
  requested_by uuid references auth.users(id) on delete set null,
  reason text not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  decision_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until > valid_from)
);

drop trigger if exists trg_tss_exceptions_updated_at on public.tss_exceptions;
create trigger trg_tss_exceptions_updated_at before update on public.tss_exceptions
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_access_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  person_id uuid not null references public.tss_people(id) on delete restrict,
  authorization_request_id uuid references public.tss_authorization_requests(id) on delete set null,
  unit_id uuid not null references public.tss_units(id) on delete restrict,
  area_id uuid references public.tss_areas(id) on delete restrict,
  access_type_id uuid references public.tss_access_types(id) on delete set null,
  event_type text not null check (event_type in ('CHECK_IN','CHECK_OUT','DENIED','CANCELLED')),
  event_at timestamptz not null default now(),
  gate text,
  vehicle_plate text,
  badge_number text,
  denial_reason text,
  recorded_by uuid references auth.users(id) on delete set null,
  source text not null default 'MANUAL' check (source in ('MANUAL','QR_CODE','IMPORT','API','SYSTEM')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tss_active_accesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  person_id uuid not null references public.tss_people(id) on delete restrict,
  unit_id uuid not null references public.tss_units(id) on delete restrict,
  area_id uuid references public.tss_areas(id) on delete restrict,
  authorization_request_id uuid references public.tss_authorization_requests(id) on delete set null,
  check_in_log_id uuid not null references public.tss_access_logs(id) on delete restrict,
  checked_in_at timestamptz not null,
  expected_checkout_at timestamptz,
  vehicle_plate text,
  badge_number text,
  created_at timestamptz not null default now(),
  unique (organization_id, person_id, unit_id)
);

create index if not exists ix_tss_authorizations_person on public.tss_authorization_requests (organization_id, person_id, status);
create index if not exists ix_tss_authorizations_period on public.tss_authorization_requests (organization_id, valid_from, valid_until);
create index if not exists ix_tss_authorizations_unit on public.tss_authorization_requests (organization_id, unit_id, status);
create index if not exists ix_tss_exceptions_person on public.tss_exceptions (organization_id, person_id, status);
create index if not exists ix_tss_exceptions_period on public.tss_exceptions (organization_id, valid_from, valid_until);
create index if not exists ix_tss_access_logs_person_time on public.tss_access_logs (organization_id, person_id, event_at desc);
create index if not exists ix_tss_access_logs_unit_time on public.tss_access_logs (organization_id, unit_id, event_at desc);
create index if not exists ix_tss_active_accesses_unit on public.tss_active_accesses (organization_id, unit_id, checked_in_at);

-- Evita duas autorizações aprovadas sobrepostas para a mesma pessoa/tipo/unidade.
create extension if not exists btree_gist;
alter table public.tss_authorization_requests
  drop constraint if exists ex_tss_authorization_overlap;
alter table public.tss_authorization_requests
  add constraint ex_tss_authorization_overlap
  exclude using gist (
    organization_id with =,
    person_id with =,
    access_type_id with =,
    unit_id with =,
    tstzrange(valid_from, valid_until, '[)') with &&
  ) where (status = 'APPROVED');

alter table public.tss_authorization_requests enable row level security;
alter table public.tss_authorization_approvals enable row level security;
alter table public.tss_exceptions enable row level security;
alter table public.tss_access_logs enable row level security;
alter table public.tss_active_accesses enable row level security;

-- Consulta operacional: última ocorrência e situação atual por pessoa.
create or replace view public.tss_v_person_access_status as
select
  p.organization_id,
  p.id as person_id,
  p.full_name,
  p.status as person_status,
  aa.id as active_access_id,
  aa.unit_id,
  aa.area_id,
  aa.checked_in_at,
  aa.expected_checkout_at,
  case
    when p.status = 'BLOCKED' then 'BLOCKED'
    when aa.id is not null then 'INSIDE'
    else 'OUTSIDE'
  end as current_access_status
from public.tss_people p
left join public.tss_active_accesses aa
  on aa.organization_id = p.organization_id
 and aa.person_id = p.id
where p.deleted_at is null;