-- TSS V29 — Documentos, anexos, treinamentos e requisitos

create table if not exists public.tss_document_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  applies_to text not null default 'PERSON' check (applies_to in ('PERSON','COMPANY','BOTH')),
  validity_days integer check (validity_days is null or validity_days > 0),
  requires_review boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

drop trigger if exists trg_tss_document_types_updated_at on public.tss_document_types;
create trigger trg_tss_document_types_updated_at before update on public.tss_document_types
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  document_type_id uuid not null references public.tss_document_types(id) on delete restrict,
  person_id uuid references public.tss_people(id) on delete cascade,
  company_id uuid references public.tss_companies(id) on delete cascade,
  document_number text,
  issued_at date,
  expires_at date,
  status text not null default 'PENDING' check (status in ('PENDING','UNDER_REVIEW','APPROVED','REJECTED','EXPIRED','CANCELLED')),
  review_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((person_id is not null)::integer + (company_id is not null)::integer = 1),
  check (expires_at is null or issued_at is null or expires_at >= issued_at)
);

drop trigger if exists trg_tss_documents_updated_at on public.tss_documents;
create trigger trg_tss_documents_updated_at before update on public.tss_documents
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_document_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  document_id uuid not null references public.tss_documents(id) on delete cascade,
  storage_bucket text not null default 'tss-documents',
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  checksum_sha256 text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table if not exists public.tss_training_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  validity_days integer check (validity_days is null or validity_days > 0),
  workload_hours numeric(8,2) check (workload_hours is null or workload_hours >= 0),
  requires_certificate boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

drop trigger if exists trg_tss_training_types_updated_at on public.tss_training_types;
create trigger trg_tss_training_types_updated_at before update on public.tss_training_types
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_trainings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  person_id uuid not null references public.tss_people(id) on delete cascade,
  training_type_id uuid not null references public.tss_training_types(id) on delete restrict,
  completed_at date not null,
  expires_at date,
  instructor_name text,
  provider_name text,
  certificate_number text,
  certificate_storage_path text,
  status text not null default 'PENDING' check (status in ('PENDING','VALID','REJECTED','EXPIRED','CANCELLED')),
  validation_notes text,
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at >= completed_at)
);

drop trigger if exists trg_tss_trainings_updated_at on public.tss_trainings;
create trigger trg_tss_trainings_updated_at before update on public.tss_trainings
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_access_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  access_type_id uuid not null references public.tss_access_types(id) on delete cascade,
  requirement_type text not null check (requirement_type in ('DOCUMENT','TRAINING')),
  document_type_id uuid references public.tss_document_types(id) on delete cascade,
  training_type_id uuid references public.tss_training_types(id) on delete cascade,
  is_mandatory boolean not null default true,
  minimum_validity_days integer not null default 0 check (minimum_validity_days >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (requirement_type = 'DOCUMENT' and document_type_id is not null and training_type_id is null)
    or
    (requirement_type = 'TRAINING' and training_type_id is not null and document_type_id is null)
  )
);

create unique index if not exists ux_tss_access_requirement_document
  on public.tss_access_requirements (access_type_id, document_type_id)
  where requirement_type = 'DOCUMENT';
create unique index if not exists ux_tss_access_requirement_training
  on public.tss_access_requirements (access_type_id, training_type_id)
  where requirement_type = 'TRAINING';

drop trigger if exists trg_tss_access_requirements_updated_at on public.tss_access_requirements;
create trigger trg_tss_access_requirements_updated_at before update on public.tss_access_requirements
for each row execute function public.tss_set_updated_at();

create index if not exists ix_tss_documents_person on public.tss_documents (organization_id, person_id, status);
create index if not exists ix_tss_documents_company on public.tss_documents (organization_id, company_id, status);
create index if not exists ix_tss_documents_expiry on public.tss_documents (organization_id, expires_at) where deleted_at is null;
create index if not exists ix_tss_trainings_person on public.tss_trainings (organization_id, person_id, status);
create index if not exists ix_tss_trainings_expiry on public.tss_trainings (organization_id, expires_at) where deleted_at is null;
create index if not exists ix_tss_access_requirements_type on public.tss_access_requirements (organization_id, access_type_id);

alter table public.tss_document_types enable row level security;
alter table public.tss_documents enable row level security;
alter table public.tss_document_attachments enable row level security;
alter table public.tss_training_types enable row level security;
alter table public.tss_trainings enable row level security;
alter table public.tss_access_requirements enable row level security;

-- Catálogo inicial. A validade real deve ser confirmada pela organização antes do piloto.
do $$
declare v_org uuid;
begin
  select id into v_org from public.tss_organizations
  where lower(coalesce(trade_name,'')) = 'tangará' or lower(legal_name) = 'tangará foods'
  order by created_at limit 1;

  if v_org is not null then
    insert into public.tss_document_types (organization_id, code, name, applies_to, validity_days) values
      (v_org,'ASO','Atestado de Saúde Ocupacional','PERSON',null),
      (v_org,'RG_CNH','Documento de Identificação','PERSON',null),
      (v_org,'CONTRATO_SOCIAL','Contrato Social','COMPANY',null),
      (v_org,'CARTAO_CNPJ','Cartão CNPJ','COMPANY',null)
    on conflict (organization_id, code) do nothing;

    insert into public.tss_training_types (organization_id, code, name, validity_days) values
      (v_org,'INTEGRACAO','Integração de Segurança',null),
      (v_org,'NR10','NR-10 — Segurança em Eletricidade',null),
      (v_org,'NR33','NR-33 — Espaço Confinado',null),
      (v_org,'NR35','NR-35 — Trabalho em Altura',null)
    on conflict (organization_id, code) do nothing;
  end if;
end;
$$;