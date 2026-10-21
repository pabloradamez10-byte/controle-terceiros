revoke create on schema public from public,anon,authenticated;
-- Tighten existing access without rewriting or deleting business data.
revoke truncate,references,trigger on all tables in schema public from public,anon,authenticated;
alter default privileges for role postgres in schema public revoke truncate,references,trigger on tables from anon,authenticated;
drop policy "sst admin read state" on public.app_data;
drop policy "sst admin insert state" on public.app_data;
drop policy "sst admin update state" on public.app_data;
create policy "active admin read state" on public.app_data for select to authenticated using ((select sst_private.is_admin()));
create policy "active admin insert state" on public.app_data for insert to authenticated with check ((select sst_private.is_admin()));
create policy "active admin update state" on public.app_data for update to authenticated using ((select sst_private.is_admin())) with check ((select sst_private.is_admin()));
drop policy "members consult state" on public.app_data;
create policy "members consult state" on public.app_data for select to authenticated using (exists(select 1 from public.sst_members m where m.user_id=(select auth.uid()) and m.ativo and (m.permissoes->>'consultar')::boolean and (coalesce((m.permissoes->>'cadastrar')::boolean,false) or coalesce((m.permissoes->>'liberar')::boolean,false))));
drop policy "admins read exceptions" on public.sst_excecoes;
drop policy "admins insert exceptions" on public.sst_excecoes;
drop policy "admins update exceptions" on public.sst_excecoes;
create policy "active admins read exceptions" on public.sst_excecoes for select to authenticated using ((select sst_private.is_admin()));
create policy "active admins insert exceptions" on public.sst_excecoes for insert to authenticated with check ((select sst_private.is_admin()) and registrado_por=(select auth.uid()) and origem='aplicativo');
create policy "active admins update exceptions" on public.sst_excecoes for update to authenticated using ((select sst_private.is_admin())) with check ((select sst_private.is_admin()) and origem in ('aplicativo','legado'));
drop policy "members consult exceptions" on public.sst_excecoes;
create policy "members consult exceptions" on public.sst_excecoes for select to authenticated using (exists(select 1 from public.sst_members m where m.user_id=(select auth.uid()) and m.ativo and (m.permissoes->>'consultar')::boolean and (coalesce((m.permissoes->>'cadastrar')::boolean,false) or coalesce((m.permissoes->>'liberar')::boolean,false))));

-- Privileged readers are private and enforce identity/active membership explicitly.
-- Consult-only users receive an allowlisted access-check projection, never file blobs.
create function sst_private.read_state() returns table(key text,data jsonb,updated_at timestamp) language plpgsql stable security definer set search_path='' as $$
declare member public.sst_members; raw jsonb; stamp timestamp; reduced jsonb;
begin
 select * into member from public.sst_members where user_id=auth.uid() and ativo;
 if member.user_id is null or not (member.role='admin' or coalesce((member.permissoes->>'consultar')::boolean,false)) then raise exception 'Consulta não autorizada' using errcode='42501'; end if;
 select a.data,a.updated_at into raw,stamp from public.app_data a where a.key='controle_terceiros_sst_state_v1';
 if raw is null then return; end if;
 if member.role='admin' or coalesce((member.permissoes->>'cadastrar')::boolean,false) or coalesce((member.permissoes->>'liberar')::boolean,false) then
  return query select 'controle_terceiros_sst_state_v1'::text,raw,stamp;return;
 end if;
 select jsonb_build_object('schema',raw->'schema','updatedAt',raw->'updatedAt','updatedBy',raw->'updatedBy',
 'terceiros',coalesce((select jsonb_agg((select jsonb_object_agg(k,v) from jsonb_each(t) e(k,v) where k=any(array['id','nome','cpf','empresaId','empresa','funcao','aso','integ']))) from jsonb_array_elements(coalesce(raw->'terceiros','[]')) t),'[]'),
 'empresas',coalesce((select jsonb_agg((select jsonb_object_agg(k,v) from jsonb_each(t) e(k,v) where k=any(array['id','nome','razaoSocial','contratoFim','docDPValidade','docSESMTValidade']))) from jsonb_array_elements(coalesce(raw->'empresas','[]')) t),'[]'),
 'treinamentos','[]'::jsonb,'historico','[]'::jsonb,'anexosTerceiros','{}'::jsonb,'anexosEmpresas','{}'::jsonb,'arquivosTerceirosV16','{}'::jsonb,'arquivosEmpresasV26','{}'::jsonb) into reduced;
 return query select 'controle_terceiros_sst_state_v1'::text,reduced,stamp;
end $$;
create function public.sst_read_state() returns table(key text,data jsonb,updated_at timestamp) language sql stable security invoker set search_path='' as $$ select * from sst_private.read_state() $$;
create function sst_private.read_exceptions() returns table(terceiro_id text,dados jsonb) language plpgsql stable security definer set search_path='' as $$
declare member public.sst_members;
begin
 select * into member from public.sst_members where user_id=auth.uid() and ativo;
 if member.user_id is null or not (member.role='admin' or coalesce((member.permissoes->>'consultar')::boolean,false)) then raise exception 'Consulta não autorizada' using errcode='42501'; end if;
 if member.role='admin' or coalesce((member.permissoes->>'cadastrar')::boolean,false) or coalesce((member.permissoes->>'liberar')::boolean,false) then
  return query select e.terceiro_id,e.dados from public.sst_excecoes e;return;
 end if;
 return query select e.terceiro_id,(select jsonb_object_agg(k,v) from jsonb_each(e.dados) a(k,v) where k=any(array['id','terceiroId','ativo','numeroAutorizacao','dataLiberacao','dataAte','pendenciasAutorizadas','aprovador','cargo','motivo','motivos'])) from public.sst_excecoes e;
end $$;
create function public.sst_read_exceptions() returns table(terceiro_id text,dados jsonb) language sql stable security invoker set search_path='' as $$ select * from sst_private.read_exceptions() $$;
revoke all on function sst_private.read_state(),sst_private.read_exceptions(),public.sst_read_state(),public.sst_read_exceptions() from public,anon;
grant execute on function sst_private.read_state(),sst_private.read_exceptions(),public.sst_read_state(),public.sst_read_exceptions() to authenticated;
