-- Authenticated, append-only business audit. No document payloads or passwords.
create table public.sst_audit_log (
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default clock_timestamp(),
 actor_user_id uuid not null, actor_email text not null,
 entity_type text not null, entity_id text not null,
 action text not null, reason text not null check(length(btrim(reason)) between 3 and 1000),
 before_data jsonb, after_data jsonb
);
create index sst_audit_log_time on public.sst_audit_log(occurred_at desc,id desc);
alter table public.sst_audit_log enable row level security;
revoke all on public.sst_audit_log from anon,authenticated;
grant select on public.sst_audit_log to authenticated;
create policy admin_reads_audit on public.sst_audit_log for select to authenticated using ((select sst_private.is_admin()));

create or replace function sst_private.audit_clean(v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; k text; item jsonb;
begin
 if jsonb_typeof(v)='object' then
 result='{}';
 for k,item in select * from jsonb_each(v) loop
  if lower(k) in ('password','senha','access_token','refresh_token') then continue; end if;
  if lower(k) in ('dataurl','base64','conteudo') and jsonb_typeof(item)='string' then
   result=result||jsonb_build_object(k,jsonb_build_object('tamanho',length(item::text),'impressao_md5',md5(item::text)));
  else result=result||jsonb_build_object(k,sst_private.audit_clean(item)); end if;
 end loop; return result;
 elsif jsonb_typeof(v)='array' then
 select coalesce(jsonb_agg(sst_private.audit_clean(value)),'[]') into result from jsonb_array_elements(v); return result;
 else return v; end if;
end $$;
revoke all on function sst_private.audit_clean(jsonb) from public;

create or replace function sst_private.audit_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare a uuid=auth.uid(); email text; why text=current_setting('sst.audit_reason',true); b jsonb; n jsonb; k text; rec record; owner text;
begin
 select m.email into email from public.sst_members m where m.user_id=a and m.ativo;
 if a is null or email is null then raise exception 'Auditoria exige login ativo'; end if;
 if why is null or length(btrim(why)) not between 3 and 1000 then raise exception 'Informe o motivo (3 a 1000 caracteres)'; end if;
 if TG_TABLE_NAME='app_data' then
  if TG_OP='DELETE' then raise exception 'Exclusão do estado não permitida'; end if;
  b=case when TG_OP='INSERT' then '{}'::jsonb else old.data end; n=new.data;
  -- Each changed person/company/training has its own entry.
  foreach k in array array['terceiros','empresas','treinamentos'] loop
   for rec in select coalesce(x.v->>'id',y.v->>'id') id,x.v before_v,y.v after_v
    from jsonb_array_elements(coalesce(b->k,'[]')) x(v) full join jsonb_array_elements(coalesce(n->k,'[]')) y(v) on x.v->>'id'=y.v->>'id'
    where x.v is distinct from y.v loop
    insert into public.sst_audit_log(actor_user_id,actor_email,entity_type,entity_id,action,reason,before_data,after_data)
    values(a,email,k,coalesce(rec.id,'sem-id'),case when rec.before_v is null then 'Inclusão' when rec.after_v is null then 'Exclusão' else 'Alteração' end,btrim(why),sst_private.audit_clean(rec.before_v),sst_private.audit_clean(rec.after_v));
   end loop;
  end loop;
  foreach k in array array['anexosTerceiros','anexosEmpresas','arquivosTerceirosV16','arquivosEmpresasV26'] loop
   for owner in select key from jsonb_object_keys(coalesce(b->k,'{}')||coalesce(n->k,'{}')) key loop
    if b->k->owner is distinct from n->k->owner then
     insert into public.sst_audit_log(actor_user_id,actor_email,entity_type,entity_id,action,reason,before_data,after_data)
     values(a,email,k,owner,'Documentos',btrim(why),sst_private.audit_clean(b->k->owner),sst_private.audit_clean(n->k->owner));
    end if;
   end loop;
  end loop;
  if (b-array['terceiros','empresas','treinamentos','anexosTerceiros','anexosEmpresas','arquivosTerceirosV16','arquivosEmpresasV26','updatedAt','updatedBy','historico']) is distinct from (n-array['terceiros','empresas','treinamentos','anexosTerceiros','anexosEmpresas','arquivosTerceirosV16','arquivosEmpresasV26','updatedAt','updatedBy','historico']) then
   insert into public.sst_audit_log(actor_user_id,actor_email,entity_type,entity_id,action,reason,before_data,after_data) values(a,email,'configuração',new.key,'Alteração',btrim(why),sst_private.audit_clean(b-array['terceiros','empresas','treinamentos','anexosTerceiros','anexosEmpresas','arquivosTerceirosV16','arquivosEmpresasV26','updatedAt','updatedBy','historico']),sst_private.audit_clean(n-array['terceiros','empresas','treinamentos','anexosTerceiros','anexosEmpresas','arquivosTerceirosV16','arquivosEmpresasV26','updatedAt','updatedBy','historico']));
  end if;
 else
  b=case when TG_OP='INSERT' then null else to_jsonb(old) end;
  n=case when TG_OP='DELETE' then null else to_jsonb(new) end;
  if (b-'updated_at') is distinct from (n-'updated_at') then
   insert into public.sst_audit_log(actor_user_id,actor_email,entity_type,entity_id,action,reason,before_data,after_data)
   values(a,email,TG_TABLE_NAME,coalesce(n->>'user_id',b->>'user_id',n->>'terceiro_id',b->>'terceiro_id'),TG_OP,btrim(why),sst_private.audit_clean(b),sst_private.audit_clean(n));
  end if;
 end if;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
revoke all on function sst_private.audit_capture() from public,anon,authenticated;

create function public.sst_save_state(p_data jsonb,p_reason text,p_expected text) returns text language plpgsql security invoker set search_path='' as $$
declare stamp text; actual text;
begin
 perform set_config('sst.audit_reason',p_reason,true);
 select updated_at::text into actual from public.app_data where key='controle_terceiros_sst_state_v1' for update;
 if actual is null then raise exception 'Estado não encontrado'; end if;
 if p_expected is null or actual::timestamp is distinct from p_expected::timestamp then raise exception 'Dados alterados por outra pessoa. Recarregue antes de salvar.'; end if;
 update public.app_data set data=p_data,updated_at=clock_timestamp() at time zone 'UTC' where key='controle_terceiros_sst_state_v1' returning updated_at::text into stamp;
 if stamp is null then raise exception 'Sem permissão para salvar'; end if;
 return stamp;
end $$;
create function public.sst_save_exception(p_id text,p_data jsonb,p_reason text) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform set_config('sst.audit_reason',p_reason,true);
 insert into public.sst_excecoes(terceiro_id,dados,registrado_por,origem,updated_at) values(p_id,p_data,auth.uid(),'aplicativo',clock_timestamp()) on conflict(terceiro_id) do update set dados=excluded.dados,updated_at=excluded.updated_at;
end $$;
create function public.sst_save_member(p_data jsonb,p_reason text,p_delete boolean default false) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not sst_private.is_admin() then raise exception 'Somente administrador'; end if;
 if (p_data->>'user_id')::uuid=auth.uid() and (p_delete or p_data->>'role'<>'admin' or p_data->>'ativo'='false') then raise exception 'Não é permitido remover o próprio acesso'; end if;
 perform set_config('sst.audit_reason',p_reason,true);
 if p_delete then delete from public.sst_members where user_id=(p_data->>'user_id')::uuid;
 else
 insert into public.sst_members(user_id,email,role,permissoes,ativo) values((p_data->>'user_id')::uuid,p_data->>'email',p_data->>'role',p_data->'permissoes',(p_data->>'ativo')::boolean)
 on conflict(user_id) do update set email=excluded.email,role=excluded.role,permissoes=excluded.permissoes,ativo=excluded.ativo;
 end if;
end $$;
revoke all on function public.sst_save_state(jsonb,text,text),public.sst_save_exception(text,jsonb,text),public.sst_save_member(jsonb,text,boolean) from public,anon;
grant execute on function public.sst_save_state(jsonb,text,text),public.sst_save_exception(text,jsonb,text),public.sst_save_member(jsonb,text,boolean) to authenticated;
-- Membership writes run under the caller's RLS (active administrators only).
grant insert,update,delete on public.sst_members to authenticated;
