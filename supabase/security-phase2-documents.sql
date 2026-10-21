insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sst-documentos','sst-documentos',false,900000,array['application/pdf','image/png','image/jpeg','image/webp']);
-- There is deliberately no browser INSERT/UPDATE/DELETE policy on storage.objects.
-- The Edge endpoint validates bytes before using its server-only credentials.
create table public.sst_document_files(
 id uuid primary key, owner_kind text not null check(owner_kind in ('terceiro','empresa')),
 owner_id text not null, path text not null unique, filename text not null,
 mime text not null check(mime in ('application/pdf','image/png','image/jpeg','image/webp')),
 size integer not null check(size between 1 and 900000), sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),created_by uuid not null references auth.users(id),
 reason text not null check(length(btrim(reason)) between 3 and 1000)
);
alter table public.sst_document_files enable row level security;
revoke all on public.sst_document_files from public,anon,authenticated;
grant select on public.sst_document_files to authenticated;
grant all on public.sst_document_files to service_role;
create policy "active document readers" on public.sst_document_files for select to authenticated using (exists(select 1 from public.sst_members m where m.user_id=(select auth.uid()) and m.ativo and (m.role='admin' or m.permissoes->'cadastrar'='true'::jsonb or m.permissoes->'liberar'='true'::jsonb)));
-- Only the authenticated Edge endpoint serves files. No public/signed URLs.
create or replace function sst_private.validate_state_v2() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; row_data jsonb; v text; f text; owner text; doc jsonb; prior jsonb; meta public.sst_document_files;
begin
 if new.key<>'controle_terceiros_sst_state_v1' then raise exception 'Chave inválida';end if;
 if jsonb_typeof(new.data)<>'object' or octet_length(new.data::text)>20000000 then raise exception 'Estado inválido ou muito grande';end if;
 foreach k in array array['terceiros','empresas','treinamentos','historico'] loop
  if jsonb_typeof(new.data->k) is distinct from 'array' then raise exception 'Coleção inválida: %',k;end if;
 end loop;
 foreach k in array array['terceiros','empresas','treinamentos'] loop
  if exists(select 1 from jsonb_array_elements(new.data->k) x group by x->>'id' having count(*)>1) then raise exception 'IDs duplicados: %',k;end if;
  for row_data in select * from jsonb_array_elements(new.data->k) loop
   if jsonb_typeof(row_data)<>'object' or jsonb_typeof(row_data->'id') is distinct from 'string' or length(row_data->>'id') not between 1 and 200 then raise exception 'ID inválido: %',k;end if;
   if row_data->'nome' is not null and (jsonb_typeof(row_data->'nome')<>'string' or length(row_data->>'nome')>500) then raise exception 'Nome inválido';end if;
   foreach f in array (case when k='terceiros' then array['aso','integ'] when k='empresas' then array['contratoFim','docDPValidade','docSESMTValidade'] else array[]::text[] end) loop
    v=row_data->>f;
    if coalesce(v,'')<>'' and not sst_private.valid_day(v) then raise exception 'Data inválida: %',f;end if;
   end loop;
  end loop;
 end loop;
 foreach k in array array['anexosTerceiros','anexosEmpresas','arquivosTerceirosV16','arquivosEmpresasV26'] loop
  if jsonb_typeof(new.data->k) is distinct from 'object' then raise exception 'Coleção documental inválida';end if;
  for owner in select jsonb_object_keys(new.data->k) loop
   if jsonb_typeof(new.data->k->owner)<>'array' then raise exception 'Lista documental inválida';end if;
   for doc in select * from jsonb_array_elements(new.data->k->owner) loop
    -- Existing metadata-only legacy attachments remain supported.
    if doc ? 'dataUrl' then
     select x into prior from jsonb_array_elements(coalesce(old.data->k->owner,'[]')) x where x->>'id'=doc->>'id' limit 1;
     if prior is null or doc->'dataUrl' is distinct from prior->'dataUrl' then raise exception 'Novos arquivos devem usar o armazenamento privado';end if;
    elsif doc ? 'storageId' then
     select * into meta from public.sst_document_files where id::text=doc->>'storageId';
     if meta.id is null or meta.owner_id<>owner or meta.owner_kind<>(case when k in ('anexosTerceiros','arquivosTerceirosV16') then 'terceiro' else 'empresa' end) or meta.path is distinct from doc->>'storagePath' or meta.mime is distinct from doc->>'mime' or meta.size::text is distinct from doc->>'tamanho' or meta.sha256 is distinct from doc->>'sha256' or meta.filename is distinct from doc->>'nome' then raise exception 'Referência de arquivo inválida';end if;
    elsif k in ('arquivosTerceirosV16','arquivosEmpresasV26') then
     raise exception 'Arquivo sem referência privada';
    end if;
    if coalesce(doc->>'validade','')<>'' and not sst_private.valid_day(doc->>'validade') then raise exception 'Validade documental inválida';end if;
   end loop;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function sst_private.validate_state_v2() from public,anon,authenticated;
create trigger sst_validate_state_v2 before insert or update on public.app_data for each row execute function sst_private.validate_state_v2();

create or replace function sst_private.validate_exception_v2() returns trigger language plpgsql set search_path='' as $$
begin
 if jsonb_typeof(new.dados)<>'object' or new.dados->>'terceiroId' is distinct from new.terceiro_id or jsonb_typeof(new.dados->'ativo') is distinct from 'boolean' then raise exception 'Exceção inválida';end if;
 if new.dados->'ativo'='true'::jsonb then
  if not sst_private.valid_day(new.dados->>'dataLiberacao') or not sst_private.valid_day(new.dados->>'dataAte') then raise exception 'Vigência inválida';end if;
  if new.dados->>'dataAte'<new.dados->>'dataLiberacao' then raise exception 'Vigência invertida';end if;
  if jsonb_typeof(new.dados->'pendenciasAutorizadas') is distinct from 'array' or length(btrim(coalesce(new.dados->>'aprovador','')))<3 or length(btrim(coalesce(new.dados->>'motivo','')))<3 then raise exception 'Informe aprovador, motivo e pendências autorizadas';end if;
 end if;
 return new;
end $$;
revoke all on function sst_private.validate_exception_v2() from public,anon,authenticated;
create trigger sst_validate_exception_v2 before insert or update on public.sst_excecoes for each row execute function sst_private.validate_exception_v2();
