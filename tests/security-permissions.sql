-- Existing members are changed only inside this rolled-back regression transaction.
-- No auth accounts, business records or emails are created.
begin;
select set_config('sst.test_admin',(select user_id::text from public.sst_members where role='admin' and ativo limit 1),true);
select set_config('sst.test_target',(select user_id::text from public.sst_members where role<>'admin' and ativo limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('sst.test_admin'),true);
select set_config('sst.audit_reason','Teste transacional de isolamento de leitura',true);
update public.sst_members set role='portaria',permissoes='{"consultar":true,"cadastrar":false,"liberar":false}' where user_id=current_setting('sst.test_target')::uuid;
select set_config('request.jwt.claim.sub',current_setting('sst.test_target'),true);
set local role authenticated;
do $$ declare state jsonb; blocked boolean=false; begin
 select data into state from public.sst_read_state();
 if state is null or jsonb_array_length(state->'terceiros')=0 then raise exception 'Consult-only reader cannot read access data'; end if;
 if state->'arquivosTerceirosV16'<>'{}'::jsonb or state->'arquivosEmpresasV26'<>'{}'::jsonb or state->'historico'<>'[]'::jsonb then raise exception 'Consult-only reader received private data'; end if;
 if exists(select 1 from public.app_data) or exists(select 1 from public.sst_excecoes) or exists(select 1 from public.sst_audit_log) or exists(select 1 from public.sst_report_snapshots) then raise exception 'Direct read bypass'; end if;
 begin perform public.sst_save_state(state,'Teste proibido','2000-01-01'); exception when others then blocked=true; end;
 if not blocked then raise exception 'Consult-only reader can write state'; end if;
 if has_table_privilege(current_user,'public.app_data','TRUNCATE') or has_table_privilege('anon','public.sst_members','TRUNCATE') then raise exception 'Excessive table grant retained'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('sst.test_admin'),true);
update public.sst_members set ativo=false where user_id=current_setting('sst.test_target')::uuid;
select set_config('request.jwt.claim.sub',current_setting('sst.test_target'),true);
set local role authenticated;
do $$ declare blocked boolean=false; begin
 begin perform * from public.sst_read_state(); exception when insufficient_privilege then blocked=true; end;
 if not blocked then raise exception 'Inactive member can read'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('sst.test_admin'),true);
update public.sst_members set ativo=false where user_id=current_setting('sst.test_admin')::uuid;
set local role authenticated;
do $$ declare blocked boolean=false; begin
 if exists(select 1 from public.app_data) or exists(select 1 from public.sst_excecoes) then raise exception 'Inactive administrator can read directly'; end if;
 begin perform * from public.sst_read_exceptions(); exception when insufficient_privilege then blocked=true; end;
 if not blocked then raise exception 'Inactive administrator can call reader'; end if;
end $$;
reset role;
select 'PASS: consult-only projection, direct read isolation, write refusal, inactive account/admin denial and minimal table grants. All fixture changes rolled back.' as result;
rollback;
