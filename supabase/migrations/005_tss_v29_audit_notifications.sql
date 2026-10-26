-- TSS V29 — Auditoria e notificações

create table if not exists public.tss_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.tss_organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  source text not null default 'APP' check (source in ('APP','DATABASE','IMPORT','API','SYSTEM')),
  ip_address inet,
  user_agent text,
  correlation_id uuid,
  occurred_at timestamptz not null default now()
);

create index if not exists ix_tss_audit_org_time on public.tss_audit_logs (organization_id, occurred_at desc);
create index if not exists ix_tss_audit_entity on public.tss_audit_logs (entity_type, entity_id, occurred_at desc);
create index if not exists ix_tss_audit_actor on public.tss_audit_logs (actor_user_id, occurred_at desc);
create index if not exists ix_tss_audit_correlation on public.tss_audit_logs (correlation_id) where correlation_id is not null;

create table if not exists public.tss_notification_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.tss_organizations(id) on delete cascade,
  code text not null,
  name text not null,
  channel text not null check (channel in ('IN_APP','EMAIL','WHATSAPP','SMS','WEBHOOK')),
  subject_template text,
  body_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code, channel)
);

drop trigger if exists trg_tss_notification_templates_updated_at on public.tss_notification_templates;
create trigger trg_tss_notification_templates_updated_at before update on public.tss_notification_templates
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  template_id uuid references public.tss_notification_templates(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  recipient_address text,
  channel text not null check (channel in ('IN_APP','EMAIL','WHATSAPP','SMS','WEBHOOK')),
  subject text,
  body text not null,
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','CRITICAL')),
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','SENT','DELIVERED','FAILED','CANCELLED')),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  retry_count integer not null default 0 check (retry_count >= 0),
  last_error text,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recipient_user_id is not null or recipient_address is not null)
);

drop trigger if exists trg_tss_notifications_updated_at on public.tss_notifications;
create trigger trg_tss_notifications_updated_at before update on public.tss_notifications
for each row execute function public.tss_set_updated_at();

create index if not exists ix_tss_notifications_queue
  on public.tss_notifications (status, scheduled_for, priority)
  where status in ('PENDING','FAILED');
create index if not exists ix_tss_notifications_user
  on public.tss_notifications (organization_id, recipient_user_id, created_at desc);
create index if not exists ix_tss_notifications_entity
  on public.tss_notifications (entity_type, entity_id, created_at desc);

-- Função genérica para registrar auditoria a partir da aplicação.
create or replace function public.tss_write_audit_log(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_source text default 'APP',
  p_correlation_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.tss_audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_data, new_data, source, correlation_id
  ) values (
    p_organization_id, auth.uid(), p_action, p_entity_type, p_entity_id,
    p_old_data, p_new_data, p_source, p_correlation_id
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.tss_write_audit_log(uuid,text,text,uuid,jsonb,jsonb,text,uuid) from public;
grant execute on function public.tss_write_audit_log(uuid,text,text,uuid,jsonb,jsonb,text,uuid) to authenticated;

-- Alertas derivados; não grava status calculado permanentemente.
create or replace view public.tss_v_compliance_alerts as
select
  d.organization_id,
  'DOCUMENT'::text as alert_type,
  d.id as entity_id,
  d.person_id,
  d.company_id,
  dt.name as requirement_name,
  d.expires_at,
  case
    when d.status = 'REJECTED' then 'CRITICAL'
    when d.expires_at is not null and d.expires_at < current_date then 'CRITICAL'
    when d.expires_at is not null and d.expires_at <= current_date + 30 then 'WARNING'
    when d.status in ('PENDING','UNDER_REVIEW') then 'PENDING'
    else 'OK'
  end as severity
from public.tss_documents d
join public.tss_document_types dt on dt.id = d.document_type_id
where d.deleted_at is null
union all
select
  t.organization_id,
  'TRAINING'::text,
  t.id,
  t.person_id,
  null::uuid,
  tt.name,
  t.expires_at,
  case
    when t.status = 'REJECTED' then 'CRITICAL'
    when t.expires_at is not null and t.expires_at < current_date then 'CRITICAL'
    when t.expires_at is not null and t.expires_at <= current_date + 30 then 'WARNING'
    when t.status = 'PENDING' then 'PENDING'
    else 'OK'
  end
from public.tss_trainings t
join public.tss_training_types tt on tt.id = t.training_type_id
where t.deleted_at is null;

alter table public.tss_audit_logs enable row level security;
alter table public.tss_notification_templates enable row level security;
alter table public.tss_notifications enable row level security;

-- Auditoria é append-only para usuários comuns.
revoke update, delete on public.tss_audit_logs from authenticated;

-- Modelos iniciais para alertas internos.
do $$
declare v_org uuid;
begin
  select id into v_org from public.tss_organizations
  where lower(coalesce(trade_name,'')) = 'tangará' or lower(legal_name) = 'tangará foods'
  order by created_at limit 1;

  if v_org is not null then
    insert into public.tss_notification_templates
      (organization_id, code, name, channel, subject_template, body_template)
    values
      (v_org,'DOCUMENT_EXPIRING','Documento próximo do vencimento','IN_APP','Documento próximo do vencimento','O documento {{document_name}} de {{person_name}} vence em {{expires_at}}.'),
      (v_org,'AUTHORIZATION_DECIDED','Autorização analisada','IN_APP','Autorização {{status}}','A solicitação de acesso de {{person_name}} foi {{status}}.'),
      (v_org,'ACCESS_DENIED','Acesso negado','IN_APP','Acesso negado','O acesso de {{person_name}} foi negado. Motivo: {{reason}}.')
    on conflict (organization_id, code, channel) do nothing;
  end if;
end;
$$;