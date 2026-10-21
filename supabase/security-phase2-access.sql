-- Additive: no business records or legacy attachments are rewritten.
create or replace function sst_private.valid_day(v text) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if v is null or v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v<'2000-01-01' then return false; end if;
 return to_char(v::date,'YYYY-MM-DD')=v;
exception when others then return false;
end $$;

create or replace function sst_private.access_v1(p jsonb,c jsonb,e jsonb,d date) returns jsonb language plpgsql immutable set search_path='' as $$
declare r text[]='{}'; w text[]='{}'; v text; label text; missing text; expired text; i int; pending boolean; granted boolean=false; dr text[]='{}'; dw text[]='{}'; safe_e jsonb;
begin
 if c is null then w=array_append(w,'Empresa não vinculada ao cadastro'); dw=w; end if;
 for i in 1..5 loop
  if i in (1,2,5) and c is null then continue; end if;
  case i
   when 1 then v=c->>'contratoFim';label='Fim da prestação de serviço';missing=label||' sem data informada';expired=label||' vencido em ';
   when 2 then v=c->>'docDPValidade';label='Documentos DP';missing=label||' sem data informada';expired=label||' vencidos em ';
   when 3 then v=p->>'aso';label='ASO';missing=label||' sem data informada';expired=label||' vencido em ';
   when 4 then v=p->>'integ';label='Integração';missing=label||' sem data informada';expired=label||' vencida em ';
   when 5 then v=c->>'docSESMTValidade';label='Documentos SESMT';missing=label||' sem data informada';expired=label||' vencidos em ';
  end case;
  if not sst_private.valid_day(v) then
   if i=3 then r=array_append(r,missing);else w=array_append(w,missing);end if;
  elsif v::date<d then r=array_append(r,expired||to_char(v::date,'DD/MM/YYYY'));
  elsif v::date-d<=30 then w=array_append(w,label||' vence em '||to_char(v::date,'DD/MM/YYYY')||' ('||(v::date-d)::text||' dia(s))'); end if;
  if i in (1,2) then dr=r;dw=w;end if;
 end loop;
 pending=cardinality(r)=0 and ('Integração sem data informada'=any(w) or 'Documentos SESMT sem data informada'=any(w));
 if e->'ativo'='true'::jsonb and sst_private.valid_day(e->>'dataLiberacao') and sst_private.valid_day(e->>'dataAte') and jsonb_typeof(e->'pendenciasAutorizadas')='array' and sst_private.valid_day(p->>'aso') then
  granted=(e->>'dataLiberacao')::date<=d and (e->>'dataAte')::date>=d and (p->>'aso')::date>=d and (cardinality(r)>0 or pending)
   and not exists(select 1 from unnest(r||w) x where not (e->'pendenciasAutorizadas') ? x);
 end if;
 select jsonb_object_agg(x.k,x.v) into safe_e from jsonb_each(coalesce(e,'{}')) x(k,v) where x.k=any(array['id','terceiroId','ativo','numeroAutorizacao','dataLiberacao','dataAte','pendenciasAutorizadas','aprovador','cargo','motivo','motivos']);
 return jsonb_build_object('dp',jsonb_build_object('motivos',dr,'avisos',dw),'sesmt',jsonb_build_object('motivos',r[cardinality(dr)+1:],'avisos',w[cardinality(dw)+1:]),'status',case when granted then 'LIBERADO POR EXCEÇÃO' when cardinality(r)>0 then 'BLOQUEADO' when pending then 'PENDENTE' else 'LIBERADO' end,
 'ok',granted or (cardinality(r)=0 and not pending),'bloqueado',cardinality(r)>0 and not granted,'pendente',pending and not granted,
 'motivos',r,'avisos',w,'excecao',granted,'excecaoDados',case when granted then safe_e else null end);
end $$;

create or replace function sst_private.access_now() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.sst_members; raw jsonb; stamp timestamp; at_time timestamptz=statement_timestamp(); results jsonb;
begin
 select * into m from public.sst_members where user_id=auth.uid() and ativo;
 if m.user_id is null or not (m.role='admin' or m.permissoes->'consultar'='true'::jsonb) then raise exception 'Consulta não autorizada' using errcode='42501';end if;
 select data,updated_at into raw,stamp from public.app_data where key='controle_terceiros_sst_state_v1';
 select coalesce(jsonb_object_agg(p->>'id',sst_private.access_v1(p,c,e.dados,(at_time at time zone 'America/Sao_Paulo')::date)),'{}') into results
 from jsonb_array_elements(raw->'terceiros') p
 left join lateral (select v c from jsonb_array_elements(raw->'empresas') v where v->>'id'=p->>'empresaId' limit 1) company on true
 left join public.sst_excecoes e on e.terceiro_id=p->>'id';
 return jsonb_build_object('rule_version','sst-access-v1','generated_at',at_time,'server_day',(at_time at time zone 'America/Sao_Paulo')::date,'state_version',stamp,'statuses',results);
end $$;
create or replace function public.sst_access_now() returns jsonb language sql stable security invoker set search_path='' as $$ select sst_private.access_now() $$;
revoke all on function sst_private.valid_day(text),sst_private.access_v1(jsonb,jsonb,jsonb,date),sst_private.access_now(),public.sst_access_now() from public,anon;
grant execute on function sst_private.valid_day(text),sst_private.access_now(),public.sst_access_now() to authenticated;
-- access_v1 is used only by the private reader and privileged regression tests.
