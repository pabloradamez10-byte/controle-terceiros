-- Run in an administrative SQL session. No test data is committed.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.sst_members where role='admin' and ativo limit 1),true);
set local role authenticated;
do $$
declare source jsonb; stamp text; n bigint; receipt jsonb; blocked boolean=false;
begin
 select count(*) into n from public.sst_report_snapshots;
 select data,updated_at::text into source,stamp from public.app_data where key='controle_terceiros_sst_state_v1';
 perform public.sst_save_state(jsonb_set(source,'{terceiros}',(source->'terceiros')||jsonb_build_array(jsonb_build_object('id','report-test-rollback','nome','Teste auditável','aso','2026-10-20'))),'Teste transacional de fonte histórica',stamp);
 if (select count(*) from public.sst_report_snapshots)<>n+1 then raise exception 'Capture must add exactly one version'; end if;
 if not exists(select 1 from public.sst_report_snapshots where state->'terceiros' @> '[{"id":"report-test-rollback"}]'::jsonb and actor_user_id=auth.uid()) then raise exception 'Missing historical source'; end if;
 perform public.sst_save_exception('report-test-rollback','{"ativo":false}','Teste transacional de exceção');
 if (select count(*) from public.sst_report_snapshots)<>n+2 then raise exception 'Exception must add one version'; end if;
 receipt=public.sst_audit_report(statement_timestamp()-interval '1 day',statement_timestamp()+interval '1 day');
 if receipt->>'issued_by'<>auth.uid()::text or jsonb_array_length(receipt->'snapshots')<1 then raise exception 'Invalid report receipt'; end if;
 if has_table_privilege(current_user,'public.sst_report_snapshots','INSERT') or has_table_privilege(current_user,'public.sst_report_snapshots','UPDATE') or has_table_privilege(current_user,'public.sst_report_snapshots','DELETE') then raise exception 'Sources writable by client'; end if;
 begin perform public.sst_audit_report(now(),now()-interval '1 day'); exception when others then blocked=true; end;
 if not blocked then raise exception 'Invalid interval accepted'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ declare blocked boolean=false; begin
 if exists(select 1 from public.sst_report_snapshots) then raise exception 'Nonmember can read sources'; end if;
 begin perform public.sst_audit_report(now()-interval '1 day',now()); exception when others then blocked=true; end;
 if not blocked then raise exception 'Nonmember can issue report'; end if;
end $$;
reset role;
select 'Source versions, actor, permissions, report range and receipt: passed. All test changes rolled back.' as result;
rollback;
