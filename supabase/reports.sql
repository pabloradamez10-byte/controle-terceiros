-- Authoritative source versions for historical access eligibility (not gate entries).
create table public.sst_report_snapshots (
 id bigint generated always as identity primary key,
 captured_at timestamptz not null default clock_timestamp(),
 actor_user_id uuid, actor_email text, reason text not null,
 source_table text not null, rule_version text not null default 'sst-access-v1',
 state jsonb not null, exceptions jsonb not null,
 audit_through_id bigint not null default 0
);
create index sst_report_snapshots_time on public.sst_report_snapshots(captured_at,id);
alter table public.sst_report_snapshots enable row level security;
revoke all on public.sst_report_snapshots from anon,authenticated;
grant select on public.sst_report_snapshots to authenticated;
create policy admin_reads_report_versions on public.sst_report_snapshots for select to authenticated using ((select sst_private.is_admin()));
create function sst_private.capture_report_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.sst_members where user_id=auth.uid() and ativo) then raise exception 'Login ativo obrigatório'; end if;
 insert into public.sst_report_snapshots(actor_user_id,actor_email,reason,source_table,state,exceptions,audit_through_id)
 select auth.uid(),(select email from public.sst_members where user_id=auth.uid()),coalesce(nullif(current_setting('sst.audit_reason',true),''),'Atualização registrada'),TG_TABLE_NAME,
 jsonb_build_object('terceiros',coalesce(a.data->'terceiros','[]'),'empresas',coalesce(a.data->'empresas','[]')),
 coalesce((select jsonb_object_agg(terceiro_id,dados) from public.sst_excecoes),'{}'),
 coalesce((select max(id) from public.sst_audit_log),0)
 from public.app_data a where a.key='controle_terceiros_sst_state_v1';
 return null;
end $$;
revoke all on function sst_private.capture_report_version() from public,anon,authenticated;
-- Alphabetical AFTER-row trigger order places report capture after audit capture.
create trigger sst_report_state after insert or update or delete on public.app_data for each row execute function sst_private.capture_report_version();
create trigger sst_report_exception after insert or update or delete on public.sst_excecoes for each row execute function sst_private.capture_report_version();
-- Baseline starts NOW. It never represents historical facts before installation.
insert into public.sst_report_snapshots(reason,source_table,state,exceptions,audit_through_id)
 select 'Início da preservação histórica; não comprova períodos anteriores','implantação',
 jsonb_build_object('terceiros',coalesce(a.data->'terceiros','[]'),'empresas',coalesce(a.data->'empresas','[]')),
 coalesce((select jsonb_object_agg(terceiro_id,dados) from public.sst_excecoes),'{}'),coalesce((select max(id) from public.sst_audit_log),0)
 from public.app_data a where a.key='controle_terceiros_sst_state_v1';

create function public.sst_audit_report(p_from timestamptz,p_to timestamptz) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare cutoff timestamptz=statement_timestamp(); result jsonb; n bigint;
begin
 if not sst_private.is_admin() then raise exception 'Somente administrador pode emitir relatório de auditoria'; end if;
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '366 days' then raise exception 'Escolha um período válido de até 366 dias'; end if;
 if p_from>=cutoff then raise exception 'Não há histórico futuro'; end if;
 cutoff=least(cutoff,p_to);
 select count(*) into n from public.sst_report_snapshots where captured_at>=p_from and captured_at<cutoff;
 if n>5000 or (select count(*) from public.sst_audit_log where occurred_at>=p_from and occurred_at<cutoff)>20000 then raise exception 'Período muito volumoso. Selecione um intervalo menor'; end if;
 select jsonb_build_object('schema','sst-audit-report-v1','generated_at',statement_timestamp(),'issued_by',auth.uid(),
 'issued_by_email',(select email from public.sst_members where user_id=auth.uid()),
 'requested_from',p_from,'requested_to_exclusive',p_to,'effective_to_exclusive',cutoff,
 'coverage_start',(select min(captured_at) from public.sst_report_snapshots),
 'timezone','America/Sao_Paulo',
 'snapshots',coalesce((select jsonb_agg(to_jsonb(s) order by s.captured_at,s.id) from public.sst_report_snapshots s where s.id=(select id from public.sst_report_snapshots where captured_at<p_from order by captured_at desc,id desc limit 1) or (s.captured_at>=p_from and s.captured_at<cutoff)),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(l) order by l.occurred_at,l.id) from public.sst_audit_log l where l.occurred_at>=p_from and l.occurred_at<cutoff),'[]')) into result;
 return result;
end $$;
revoke all on function public.sst_audit_report(timestamptz,timestamptz) from public,anon;
grant execute on function public.sst_audit_report(timestamptz,timestamptz) to authenticated;

-- Serialize all source writes so versions cannot miss concurrent changes.
create or replace function public.sst_save_state(p_data jsonb,p_reason text,p_expected text) returns text language plpgsql security invoker set search_path='' as $$
declare stamp text; actual text;
begin
 perform pg_catalog.pg_advisory_xact_lock(204701,1);
 perform set_config('sst.audit_reason',p_reason,true);
 select updated_at::text into actual from public.app_data where key='controle_terceiros_sst_state_v1' for update;
 if actual is null then raise exception 'Estado não encontrado'; end if;
 if p_expected is null or actual::timestamp is distinct from p_expected::timestamp then raise exception 'Dados alterados por outra pessoa. Recarregue antes de salvar.'; end if;
 update public.app_data set data=p_data,updated_at=clock_timestamp() at time zone 'UTC' where key='controle_terceiros_sst_state_v1' returning updated_at::text into stamp;
 if stamp is null then raise exception 'Sem permissão para salvar'; end if;
 return stamp;
end $$;
create or replace function public.sst_save_exception(p_id text,p_data jsonb,p_reason text) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(204701,1);
 perform set_config('sst.audit_reason',p_reason,true);
 insert into public.sst_excecoes(terceiro_id,dados,registrado_por,origem,updated_at) values(p_id,p_data,auth.uid(),'aplicativo',clock_timestamp()) on conflict(terceiro_id) do update set dados=excluded.dados,updated_at=excluded.updated_at;
end $$;
