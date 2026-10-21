-- Read-only. Run before export and after restore with a DBA identity.
select jsonb_build_object(
 'database_version',current_setting('server_version'),
 'people',(select jsonb_array_length(data->'terceiros') from public.app_data where key='controle_terceiros_sst_state_v1'),
 'companies',(select jsonb_array_length(data->'empresas') from public.app_data where key='controle_terceiros_sst_state_v1'),
 'state_md5',(select md5(data::text) from public.app_data where key='controle_terceiros_sst_state_v1'),
 'auth_users',(select count(*) from auth.users),
 'members',(select count(*) from public.sst_members),
 'exceptions',(select count(*) from public.sst_excecoes),
 'audit_events',(select count(*) from public.sst_audit_log),
 'report_snapshots',(select count(*) from public.sst_report_snapshots),
 'private_files',(select count(*) from public.sst_document_files),
 'storage_objects',(select count(*) from storage.objects where bucket_id='sst-documentos'),
 'document_bucket_private',(select not public from storage.buckets where id='sst-documentos'),
 'rls',(select jsonb_object_agg(relname,relrowsecurity) from pg_class where oid=any(array['public.app_data'::regclass,'public.sst_members'::regclass,'public.sst_excecoes'::regclass,'public.sst_audit_log'::regclass,'public.sst_report_snapshots'::regclass,'public.sst_document_files'::regclass]))
) as migration_evidence;
