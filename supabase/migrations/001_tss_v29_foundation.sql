-- TSS V29 — Fundação do banco normalizado
-- Cria a nova estrutura em paralelo. Não remove app_data nem altera o app atual.

create extension if not exists pgcrypto;

create or replace function public.tss_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.tss_organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  document_number text,
  email text,
  phone text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','SUSPENDED')),
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_tss_organizations_document_number
  on public.tss_organizations (document_number)
  where document_number is not null and deleted_at is null;

drop trigger if exists trg_tss_organizations_updated_at on public.tss_organizations;
create trigger trg_tss_organizations_updated_at
before update on public.tss_organizations
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete restrict,
  name text not null,
  code text,
  city text,
  state text,
  address text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index if not exists ix_tss_units_organization on public.tss_units (organization_id);
drop trigger if exists trg_tss_units_updated_at on public.tss_units;
create trigger trg_tss_units_updated_at before update on public.tss_units
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete restrict,
  unit_id uuid not null references public.tss_units(id) on delete restrict,
  name text not null,
  code text,
  description text,
  risk_level text not null default 'LOW' check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  requires_escort boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, name)
);
create index if not exists ix_tss_areas_org on public.tss_areas (organization_id);
create index if not exists ix_tss_areas_unit on public.tss_areas (unit_id);
drop trigger if exists trg_tss_areas_updated_at on public.tss_areas;
create trigger trg_tss_areas_updated_at before update on public.tss_areas
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete restrict,
  legal_name text not null,
  trade_name text,
  document_number text,
  contact_name text,
  contact_email text,
  contact_phone text,
  contract_start_date date,
  contract_end_date date,
  company_type text not null default 'SERVICE_PROVIDER' check (
    company_type in ('SERVICE_PROVIDER','SUPPLIER','TRANSPORTER','VISITOR_ORIGIN','OTHER')
  ),
  status text not null default 'ACTIVE' check (
    status in ('ACTIVE','INACTIVE','PENDING','BLOCKED','SUSPENDED')
  ),
  notes text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_tss_companies_org on public.tss_companies (organization_id);
create index if not exists ix_tss_companies_status on public.tss_companies (organization_id, status);
create unique index if not exists ux_tss_companies_document
  on public.tss_companies (organization_id, document_number)
  where document_number is not null and deleted_at is null;
drop trigger if exists trg_tss_companies_updated_at on public.tss_companies;
create trigger trg_tss_companies_updated_at before update on public.tss_companies
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete restrict,
  company_id uuid references public.tss_companies(id) on delete restrict,
  full_name text not null,
  document_number text,
  secondary_document text,
  person_type text not null check (
    person_type in ('THIRD_PARTY','VISITOR','DRIVER','DELIVERY','EMPLOYEE','OTHER')
  ),
  job_title text,
  phone text,
  email text,
  photo_path text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','PENDING','BLOCKED')),
  notes text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (person_type not in ('THIRD_PARTY','DRIVER') or company_id is not null)
);
create index if not exists ix_tss_people_org on public.tss_people (organization_id);
create index if not exists ix_tss_people_company on public.tss_people (company_id);
create index if not exists ix_tss_people_type on public.tss_people (organization_id, person_type);
create index if not exists ix_tss_people_status on public.tss_people (organization_id, status);
create index if not exists ix_tss_people_name on public.tss_people (organization_id, full_name);
create unique index if not exists ux_tss_people_document
  on public.tss_people (organization_id, document_number)
  where document_number is not null and deleted_at is null;
drop trigger if exists trg_tss_people_updated_at on public.tss_people;
create trigger trg_tss_people_updated_at before update on public.tss_people
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_visit_purposes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  requires_host boolean not null default true,
  requires_escort boolean not null default false,
  allows_operational_area boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists ix_tss_visit_purposes_org on public.tss_visit_purposes (organization_id);
drop trigger if exists trg_tss_visit_purposes_updated_at on public.tss_visit_purposes;
create trigger trg_tss_visit_purposes_updated_at before update on public.tss_visit_purposes
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_access_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  person_type text not null check (
    person_type in ('THIRD_PARTY','VISITOR','DRIVER','DELIVERY','EMPLOYEE','OTHER')
  ),
  requires_company boolean not null default false,
  requires_host boolean not null default false,
  requires_escort boolean not null default false,
  requires_authorization boolean not null default false,
  max_stay_minutes integer check (max_stay_minutes is null or max_stay_minutes > 0),
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index if not exists ix_tss_access_types_org on public.tss_access_types (organization_id);
create index if not exists ix_tss_access_types_person_type on public.tss_access_types (organization_id, person_type);
drop trigger if exists trg_tss_access_types_updated_at on public.tss_access_types;
create trigger trg_tss_access_types_updated_at before update on public.tss_access_types
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_person_access_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete restrict,
  person_id uuid not null references public.tss_people(id) on delete cascade,
  access_type_id uuid not null references public.tss_access_types(id) on delete restrict,
  unit_id uuid references public.tss_units(id) on delete restrict,
  area_id uuid references public.tss_areas(id) on delete restrict,
  valid_from date,
  valid_until date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','PENDING','BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, access_type_id, unit_id, area_id)
);
create index if not exists ix_tss_person_access_person on public.tss_person_access_types (person_id);
create index if not exists ix_tss_person_access_type on public.tss_person_access_types (access_type_id);
create index if not exists ix_tss_person_access_unit_area on public.tss_person_access_types (unit_id, area_id);
drop trigger if exists trg_tss_person_access_types_updated_at on public.tss_person_access_types;
create trigger trg_tss_person_access_types_updated_at before update on public.tss_person_access_types
for each row execute function public.tss_set_updated_at();

insert into public.tss_organizations (legal_name, trade_name, status)
select 'Tangará Foods', 'Tangará', 'ACTIVE'
where not exists (
  select 1 from public.tss_organizations
  where lower(coalesce(trade_name,'')) = lower('Tangará')
     or lower(legal_name) = lower('Tangará Foods')
);

do $$
declare
  v_org uuid;
begin
  select id into v_org
  from public.tss_organizations
  where lower(coalesce(trade_name,'')) = lower('Tangará')
     or lower(legal_name) = lower('Tangará Foods')
  order by created_at limit 1;

  insert into public.tss_access_types (
    organization_id, code, name, description, person_type,
    requires_company, requires_host, requires_escort, requires_authorization
  ) values
    (v_org,'TERCEIRO_MANUTENCAO','Terceiro de Manutenção','Atividade técnica ou operacional.','THIRD_PARTY',true,false,false,true),
    (v_org,'TERCEIRO_ADMINISTRATIVO','Terceiro Administrativo','Atividade administrativa.','THIRD_PARTY',true,false,false,true),
    (v_org,'VISITANTE_REUNIAO','Visitante para Reunião','Acesso administrativo para reunião.','VISITOR',false,true,false,true),
    (v_org,'VISITANTE_AREA_PRODUTIVA','Visitante em Área Produtiva','Acesso operacional acompanhado.','VISITOR',false,true,true,true),
    (v_org,'MOTORISTA','Motorista','Coleta, descarga ou carregamento.','DRIVER',true,false,false,true),
    (v_org,'ENTREGA','Entrega','Entrega de materiais, normalmente no almoxarifado.','DELIVERY',false,false,false,false)
  on conflict (organization_id, code) do nothing;

  insert into public.tss_visit_purposes (
    organization_id, code, name, description, requires_host, requires_escort, allows_operational_area
  ) values
    (v_org,'MEETING','Reunião','Visita para reunião administrativa.',true,false,false),
    (v_org,'TECHNICAL_VISIT','Visita Técnica','Visita técnica ou acompanhamento.',true,true,true),
    (v_org,'AUDIT','Auditoria','Auditoria interna ou externa.',true,true,true),
    (v_org,'INTERVIEW','Entrevista','Entrevista ou processo seletivo.',true,false,false),
    (v_org,'DELIVERY','Entrega','Entrega de materiais no almoxarifado.',false,false,false),
    (v_org,'OTHER','Outro','Motivo não listado.',true,false,false)
  on conflict (organization_id, code) do nothing;
end;
$$;

alter table public.tss_organizations enable row level security;
alter table public.tss_units enable row level security;
alter table public.tss_areas enable row level security;
alter table public.tss_companies enable row level security;
alter table public.tss_people enable row level security;
alter table public.tss_visit_purposes enable row level security;
alter table public.tss_access_types enable row level security;
alter table public.tss_person_access_types enable row level security;
