-- V30: exige usuário autenticado para ler e sincronizar o estado do TSS.
-- Execute somente depois de publicar a V30, pois versões anteriores usam o token anônimo.

alter table public.app_data enable row level security;

drop policy if exists "tss_authenticated_read" on public.app_data;
create policy "tss_authenticated_read"
on public.app_data
for select
to authenticated
using (key = 'controle_terceiros_sst_state_v1');

drop policy if exists "tss_authenticated_insert" on public.app_data;
create policy "tss_authenticated_insert"
on public.app_data
for insert
to authenticated
with check (key = 'controle_terceiros_sst_state_v1');

drop policy if exists "tss_authenticated_update" on public.app_data;
create policy "tss_authenticated_update"
on public.app_data
for update
to authenticated
using (key = 'controle_terceiros_sst_state_v1')
with check (key = 'controle_terceiros_sst_state_v1');

revoke all on table public.app_data from anon;
grant select, insert, update on table public.app_data to authenticated;

comment on table public.app_data is
'Estado compartilhado do TSS. V30 exige Supabase Auth. A matriz por perfil ainda é aplicada na interface; separar entidades em tabelas próprias é a próxima evolução de segurança.';
