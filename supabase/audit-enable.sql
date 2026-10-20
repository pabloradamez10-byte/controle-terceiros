create trigger sst_audit_state after insert or update or delete on public.app_data for each row execute function sst_private.audit_capture();
create trigger sst_audit_exceptions after insert or update or delete on public.sst_excecoes for each row execute function sst_private.audit_capture();
create trigger sst_audit_members before insert or update or delete on public.sst_members for each row execute function sst_private.audit_capture();
