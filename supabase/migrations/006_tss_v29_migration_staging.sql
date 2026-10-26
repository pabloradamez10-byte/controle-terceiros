-- TSS V29 — Preparação segura para migração da V28/app_data
-- Este script NÃO copia dados automaticamente para as tabelas definitivas.
-- Ele cria uma área de staging, registra lotes e oferece validações antes do corte.

create table if not exists public.tss_migration_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.tss_organizations(id) on delete cascade,
  source_system text not null default 'TSS_V28_APP_DATA',
  source_reference text,
  status text not null default 'CREATED' check (status in ('CREATED','IMPORTED','VALIDATED','APPLIED','FAILED','CANCELLED')),
  total_records integer not null default 0 check (total_records >= 0),
  valid_records integer not null default 0 check (valid_records >= 0),
  invalid_records integer not null default 0 check (invalid_records >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  applied_at timestamptz
);

create table if not exists public.tss_migration_staging (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.tss_migration_batches(id) on delete cascade,
  organization_id uuid references public.tss_organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('COMPANY','PERSON','DOCUMENT','TRAINING','AUTHORIZATION','ACCESS_LOG','OTHER')),
  legacy_key text,
  raw_data jsonb not null,
  normalized_data jsonb,
  validation_status text not null default 'PENDING' check (validation_status in ('PENDING','VALID','INVALID','WARNING','APPLIED')),
  validation_errors jsonb not null default '[]'::jsonb,
  target_table text,
  target_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, entity_type, legacy_key)
);

drop trigger if exists trg_tss_migration_staging_updated_at on public.tss_migration_staging;
create trigger trg_tss_migration_staging_updated_at before update on public.tss_migration_staging
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_migration_issues (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.tss_migration_batches(id) on delete cascade,
  staging_id uuid references public.tss_migration_staging(id) on delete cascade,
  severity text not null check (severity in ('INFO','WARNING','ERROR','BLOCKER')),
  issue_code text not null,
  message text not null,
  field_name text,
  legacy_value text,
  resolution_status text not null default 'OPEN' check (resolution_status in ('OPEN','RESOLVED','IGNORED')),
  resolution_notes text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ix_tss_migration_batches_status on public.tss_migration_batches (status, created_at desc);
create index if not exists ix_tss_migration_staging_batch_status on public.tss_migration_staging (batch_id, validation_status);
create index if not exists ix_tss_migration_staging_legacy on public.tss_migration_staging (entity_type, legacy_key);
create index if not exists ix_tss_migration_issues_open on public.tss_migration_issues (batch_id, severity) where resolution_status = 'OPEN';

-- Resumo de qualidade por lote.
create or replace view public.tss_v_migration_batch_summary as
select
  b.id as batch_id,
  b.organization_id,
  b.source_system,
  b.status,
  b.created_at,
  count(s.id) as staged_records,
  count(s.id) filter (where s.validation_status = 'VALID') as valid_records,
  count(s.id) filter (where s.validation_status = 'WARNING') as warning_records,
  count(s.id) filter (where s.validation_status = 'INVALID') as invalid_records,
  count(i.id) filter (where i.resolution_status = 'OPEN' and i.severity = 'BLOCKER') as open_blockers
from public.tss_migration_batches b
left join public.tss_migration_staging s on s.batch_id = b.id
left join public.tss_migration_issues i on i.batch_id = b.id
  and (i.staging_id = s.id or i.staging_id is null)
group by b.id;

-- Atualiza contadores do lote com base no staging.
create or replace function public.tss_refresh_migration_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tss_migration_batches b
  set
    total_records = x.total_records,
    valid_records = x.valid_records,
    invalid_records = x.invalid_records,
    status = case
      when x.total_records = 0 then 'CREATED'
      when x.invalid_records > 0 then 'IMPORTED'
      else 'VALIDATED'
    end,
    validated_at = case when x.total_records > 0 and x.invalid_records = 0 then now() else b.validated_at end
  from (
    select
      count(*)::integer as total_records,
      count(*) filter (where validation_status in ('VALID','WARNING'))::integer as valid_records,
      count(*) filter (where validation_status = 'INVALID')::integer as invalid_records
    from public.tss_migration_staging
    where batch_id = p_batch_id
  ) x
  where b.id = p_batch_id;
end;
$$;

revoke all on function public.tss_refresh_migration_batch(uuid) from public;
grant execute on function public.tss_refresh_migration_batch(uuid) to authenticated;

-- Verificações pré-corte. Devem retornar zero antes da ativação da V29.
create or replace view public.tss_v_pre_cutover_checks as
select 'PEOPLE_WITHOUT_NAME'::text as check_code, count(*)::bigint as issue_count
from public.tss_people where deleted_at is null and nullif(trim(full_name),'') is null
union all
select 'THIRD_PARTY_WITHOUT_COMPANY', count(*)
from public.tss_people where deleted_at is null and person_type = 'THIRD_PARTY' and company_id is null
union all
select 'APPROVED_DOCUMENT_EXPIRED', count(*)
from public.tss_documents where deleted_at is null and status = 'APPROVED' and expires_at < current_date
union all
select 'VALID_TRAINING_EXPIRED', count(*)
from public.tss_trainings where deleted_at is null and status = 'VALID' and expires_at < current_date
union all
select 'APPROVED_AUTHORIZATION_OUTSIDE_PERIOD', count(*)
from public.tss_authorization_requests where status = 'APPROVED' and valid_until <= valid_from
union all
select 'ACTIVE_ACCESS_WITHOUT_CHECKIN', count(*)
from public.tss_active_accesses aa
left join public.tss_access_logs al on al.id = aa.check_in_log_id and al.event_type = 'CHECK_IN'
where al.id is null;

alter table public.tss_migration_batches enable row level security;
alter table public.tss_migration_staging enable row level security;
alter table public.tss_migration_issues enable row level security;

-- Ordem operacional recomendada:
-- 1. Exportar snapshot da V28/app_data sem alterar a origem.
-- 2. Criar lote em tss_migration_batches.
-- 3. Inserir JSON bruto em tss_migration_staging.
-- 4. Normalizar e validar cada entidade.
-- 5. Resolver BLOCKERs e divergências de nomes/documentos.
-- 6. Aplicar em ambiente de teste.
-- 7. Comparar totais e amostras com a V28.
-- 8. Somente então planejar o corte de produção.