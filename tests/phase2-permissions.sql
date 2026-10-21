-- Existing accounts are used only inside the rolled-back transaction. No emails.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.sst_members where role='admin' and ativo limit 1),true);
select set_config('sst.audit_reason','Verificação transacional da etapa 2',true);
do $$ declare baseline jsonb; failed boolean; begin
 select data into baseline from public.app_data where key='controle_terceiros_sst_state_v1';
 -- Current legacy state remains saveable, with original attachment bytes unchanged.
 update public.app_data set data=baseline where key='controle_terceiros_sst_state_v1';
 failed=false;
 begin update public.app_data set data=jsonb_set(baseline,'{terceiros,0,aso}','"2026-02-30"') where key='controle_terceiros_sst_state_v1';exception when others then if sqlerrm not like 'Data inválida:%' then raise;end if;failed=true;end;
 if not failed then raise exception 'Invalid date accepted';end if;
 failed=false;
 begin update public.app_data set data=jsonb_set(baseline,'{terceiros}',(baseline->'terceiros')||jsonb_build_array(baseline->'terceiros'->0)) where key='controle_terceiros_sst_state_v1';exception when others then if sqlerrm not like 'IDs duplicados:%' then raise;end if;failed=true;end;
 if not failed then raise exception 'Duplicate ID accepted';end if;
 failed=false;
 begin update public.app_data set data=jsonb_set(baseline,'{arquivosTerceirosV16}',jsonb_build_object('test-owner',jsonb_build_array(jsonb_build_object('id','forged','dataUrl','data:application/pdf;base64,JVBERg==')))) where key='controle_terceiros_sst_state_v1';exception when others then if sqlerrm not like 'Novos arquivos%' then raise;end if;failed=true;end;
 if not failed then raise exception 'New inline file accepted';end if;
 failed=false;
 begin update public.app_data set data=jsonb_set(baseline,'{arquivosTerceirosV16}',jsonb_build_object('test-owner',jsonb_build_array(jsonb_build_object('id','forged','storageId','00000000-0000-0000-0000-000000000000')))) where key='controle_terceiros_sst_state_v1';exception when others then if sqlerrm not like 'Referência de arquivo%' then raise;end if;failed=true;end;
 if not failed then raise exception 'Forged storage reference accepted';end if;
 if public.sst_access_now()->>'rule_version'<>'sst-access-v1' then raise exception 'Wrong rule';end if;
 if has_function_privilege('anon','public.sst_access_now()','EXECUTE') or has_table_privilege('authenticated','public.sst_document_files','INSERT') or has_table_privilege('authenticated','public.sst_document_files','UPDATE') then raise exception 'Excess privileges';end if;
end $$;
select set_config('sst.test_target',(select user_id::text from public.sst_members where role<>'admin' and ativo limit 1),true);
update public.sst_members set role='portaria',permissoes='{"consultar":true}' where user_id=current_setting('sst.test_target')::uuid;
select set_config('request.jwt.claim.sub',current_setting('sst.test_target'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.sst_document_files) then raise exception 'Portaria can read files';end if;
 if public.sst_access_now()->'statuses'='{}'::jsonb then raise exception 'Portaria cannot check access';end if;
end $$;
reset role;
select 'PASS: legacy save, invalid dates, duplicate IDs, inline file refusal, forged reference refusal, current access RPC, private document permissions. All mutations rolled back.' as result;
rollback;
