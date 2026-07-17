-- TSS V29 — Perfis, permissões e escopos

create table if not exists public.tss_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.tss_organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

drop trigger if exists trg_tss_profiles_updated_at on public.tss_profiles;
create trigger trg_tss_profiles_updated_at before update on public.tss_profiles
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  module text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tss_profile_permissions (
  profile_id uuid not null references public.tss_profiles(id) on delete cascade,
  permission_id uuid not null references public.tss_permissions(id) on delete cascade,
  effect text not null default 'ALLOW' check (effect in ('ALLOW','DENY')),
  created_at timestamptz not null default now(),
  primary key (profile_id, permission_id)
);

create table if not exists public.tss_user_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.tss_profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, profile_id)
);

create table if not exists public.tss_user_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_id uuid not null references public.tss_permissions(id) on delete cascade,
  effect text not null check (effect in ('ALLOW','DENY')),
  reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, permission_id)
);

create table if not exists public.tss_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  code text not null,
  name text not null,
  scope_type text not null check (
    scope_type in ('ORGANIZATION','UNIT','AREA','COMPANY','OWN_RECORDS','PORTARIA')
  ),
  unit_id uuid references public.tss_units(id) on delete cascade,
  area_id uuid references public.tss_areas(id) on delete cascade,
  company_id uuid references public.tss_companies(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

drop trigger if exists trg_tss_scopes_updated_at on public.tss_scopes;
create trigger trg_tss_scopes_updated_at before update on public.tss_scopes
for each row execute function public.tss_set_updated_at();

create table if not exists public.tss_user_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tss_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_id uuid not null references public.tss_scopes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, scope_id)
);

create index if not exists ix_tss_profiles_org on public.tss_profiles (organization_id);
create index if not exists ix_tss_profile_permissions_profile on public.tss_profile_permissions (profile_id);
create index if not exists ix_tss_user_profiles_user on public.tss_user_profiles (organization_id, user_id);
create index if not exists ix_tss_user_permissions_user on public.tss_user_permissions (organization_id, user_id);
create index if not exists ix_tss_scopes_org_type on public.tss_scopes (organization_id, scope_type);
create index if not exists ix_tss_user_scopes_user on public.tss_user_scopes (organization_id, user_id);

insert into public.tss_permissions (code, name, module) values
  ('organization.view','Visualizar organização','organization'),
  ('organization.manage','Gerenciar organização','organization'),
  ('user.view','Visualizar usuários','users'),
  ('user.create','Criar usuários','users'),
  ('user.edit','Editar usuários','users'),
  ('user.disable','Desativar usuários','users'),
  ('user.assign_permissions','Atribuir permissões','users'),
  ('company.view','Visualizar empresas','companies'),
  ('company.create','Criar empresas','companies'),
  ('company.edit','Editar empresas','companies'),
  ('company.disable','Desativar empresas','companies'),
  ('person.view','Visualizar pessoas','people'),
  ('person.create','Criar pessoas','people'),
  ('person.edit','Editar pessoas','people'),
  ('person.disable','Desativar pessoas','people'),
  ('document.view','Visualizar documentos','documents'),
  ('document.upload','Anexar documentos','documents'),
  ('document.edit','Editar documentos','documents'),
  ('document.review','Revisar documentos','documents'),
  ('document.approve','Aprovar documentos','documents'),
  ('document.reject','Rejeitar documentos','documents'),
  ('document.delete','Remover documentos','documents'),
  ('training.view','Visualizar treinamentos','trainings'),
  ('training.create','Criar treinamentos','trainings'),
  ('training.edit','Editar treinamentos','trainings'),
  ('training.validate','Validar treinamentos','trainings'),
  ('requirement.view','Visualizar requisitos','requirements'),
  ('requirement.manage','Gerenciar requisitos','requirements'),
  ('compliance.view','Visualizar conformidade','compliance'),
  ('compliance.recalculate','Recalcular conformidade','compliance'),
  ('authorization.view','Visualizar autorizações','authorizations'),
  ('authorization.request','Solicitar autorização','authorizations'),
  ('authorization.approve','Aprovar autorização','authorizations'),
  ('authorization.reject','Rejeitar autorização','authorizations'),
  ('authorization.cancel','Cancelar autorização','authorizations'),
  ('exception.request','Solicitar exceção','exceptions'),
  ('exception.approve','Aprovar exceção','exceptions'),
  ('exception.reject','Rejeitar exceção','exceptions'),
  ('exception.cancel','Cancelar exceção','exceptions'),
  ('access.view','Visualizar acesso','access'),
  ('access.check_in','Registrar entrada','access'),
  ('access.check_out','Registrar saída','access'),
  ('access.deny','Negar acesso','access'),
  ('access.view_restrictions','Visualizar restrições','access'),
  ('dashboard.view','Visualizar dashboard','dashboard'),
  ('report.view','Visualizar relatórios','reports'),
  ('report.export','Exportar relatórios','reports'),
  ('audit.view','Visualizar auditoria','audit'),
  ('settings.manage','Gerenciar configurações','settings')
on conflict (code) do nothing;

do $$
declare
  v_org uuid;
begin
  select id into v_org
  from public.tss_organizations
  where lower(coalesce(trade_name,'')) = lower('Tangará')
     or lower(legal_name) = lower('Tangará Foods')
  order by created_at limit 1;

  insert into public.tss_profiles (organization_id, code, name, description, is_system) values
    (v_org,'SYSTEM_ADMIN','Administrador do Sistema','Acesso técnico total à plataforma.',true),
    (v_org,'CLIENT_ADMIN','Administrador do Cliente','Administra a organização e seus usuários.',true),
    (v_org,'THIRD_PARTY_MANAGER','Gestor de Terceiros','Gerencia empresas, pessoas e pendências.',true),
    (v_org,'SESMT','SESMT','Valida documentos e requisitos de segurança.',true),
    (v_org,'SUPERVISOR','Supervisor / Gestor da Área','Solicita acessos e acompanha sua área.',true),
    (v_org,'GATEHOUSE','Portaria','Consulta e registra entrada e saída.',true),
    (v_org,'CONTRACTOR_COMPANY','Empresa Terceirizada','Gerencia apenas a própria empresa e trabalhadores.',true),
    (v_org,'HOST','Anfitrião / Solicitante','Solicita e acompanha visitantes.',true),
    (v_org,'READ_ONLY','Consulta','Somente leitura e relatórios.',true)
  on conflict (organization_id, code) do nothing;

  insert into public.tss_scopes (organization_id, code, name, scope_type) values
    (v_org,'ORG_ALL','Toda a organização','ORGANIZATION'),
    (v_org,'OWN_RECORDS','Somente registros próprios','OWN_RECORDS'),
    (v_org,'PORTARIA','Operação de portaria','PORTARIA')
  on conflict (organization_id, code) do nothing;
end;
$$;

-- Matriz padrão inicial de permissões por perfil.
with profile_map as (
  select id, code from public.tss_profiles
), perm_map as (
  select id, code from public.tss_permissions
), grants(profile_code, permission_code) as (
  values
    ('CLIENT_ADMIN','organization.view'),('CLIENT_ADMIN','user.view'),('CLIENT_ADMIN','user.create'),('CLIENT_ADMIN','user.edit'),('CLIENT_ADMIN','user.disable'),('CLIENT_ADMIN','user.assign_permissions'),
    ('CLIENT_ADMIN','company.view'),('CLIENT_ADMIN','company.create'),('CLIENT_ADMIN','company.edit'),('CLIENT_ADMIN','company.disable'),
    ('CLIENT_ADMIN','person.view'),('CLIENT_ADMIN','person.create'),('CLIENT_ADMIN','person.edit'),('CLIENT_ADMIN','person.disable'),
    ('CLIENT_ADMIN','document.view'),('CLIENT_ADMIN','document.upload'),('CLIENT_ADMIN','document.edit'),('CLIENT_ADMIN','dashboard.view'),('CLIENT_ADMIN','report.view'),('CLIENT_ADMIN','report.export'),('CLIENT_ADMIN','audit.view'),

    ('THIRD_PARTY_MANAGER','company.view'),('THIRD_PARTY_MANAGER','company.create'),('THIRD_PARTY_MANAGER','company.edit'),
    ('THIRD_PARTY_MANAGER','person.view'),('THIRD_PARTY_MANAGER','person.create'),('THIRD_PARTY_MANAGER','person.edit'),
    ('THIRD_PARTY_MANAGER','document.view'),('THIRD_PARTY_MANAGER','document.upload'),('THIRD_PARTY_MANAGER','document.review'),
    ('THIRD_PARTY_MANAGER','authorization.view'),('THIRD_PARTY_MANAGER','authorization.request'),('THIRD_PARTY_MANAGER','dashboard.view'),('THIRD_PARTY_MANAGER','report.view'),

    ('SESMT','person.view'),('SESMT','document.view'),('SESMT','document.review'),('SESMT','document.approve'),('SESMT','document.reject'),
    ('SESMT','training.view'),('SESMT','training.create'),('SESMT','training.edit'),('SESMT','training.validate'),
    ('SESMT','requirement.view'),('SESMT','requirement.manage'),('SESMT','compliance.view'),('SESMT','compliance.recalculate'),('SESMT','access.view_restrictions'),('SESMT','dashboard.view'),('SESMT','report.view'),

    ('SUPERVISOR','person.view'),('SUPERVISOR','document.view'),('SUPERVISOR','authorization.view'),('SUPERVISOR','authorization.request'),('SUPERVISOR','exception.request'),('SUPERVISOR','access.view'),

    ('GATEHOUSE','person.view'),('GATEHOUSE','access.view'),('GATEHOUSE','access.check_in'),('GATEHOUSE','access.check_out'),('GATEHOUSE','access.deny'),('GATEHOUSE','access.view_restrictions'),

    ('CONTRACTOR_COMPANY','company.view'),('CONTRACTOR_COMPANY','person.view'),('CONTRACTOR_COMPANY','person.create'),('CONTRACTOR_COMPANY','person.edit'),('CONTRACTOR_COMPANY','document.view'),('CONTRACTOR_COMPANY','document.upload'),('CONTRACTOR_COMPANY','authorization.request'),

    ('HOST','person.view'),('HOST','authorization.view'),('HOST','authorization.request'),('HOST','access.view'),

    ('READ_ONLY','company.view'),('READ_ONLY','person.view'),('READ_ONLY','document.view'),('READ_ONLY','training.view'),('READ_ONLY','authorization.view'),('READ_ONLY','access.view'),('READ_ONLY','dashboard.view'),('READ_ONLY','report.view'),('READ_ONLY','audit.view')
)
insert into public.tss_profile_permissions (profile_id, permission_id, effect)
select p.id, pe.id, 'ALLOW'
from grants g
join profile_map p on p.code = g.profile_code
join perm_map pe on pe.code = g.permission_code
on conflict (profile_id, permission_id) do nothing;

alter table public.tss_profiles enable row level security;
alter table public.tss_permissions enable row level security;
alter table public.tss_profile_permissions enable row level security;
alter table public.tss_user_profiles enable row level security;
alter table public.tss_user_permissions enable row level security;
alter table public.tss_scopes enable row level security;
alter table public.tss_user_scopes enable row level security;
