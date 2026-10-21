// Generate an executable database regression from the historical JS evaluator.
const fs=require('node:fs');require('../relatorios.js');const core=globalThis.sstRelatorioCore;
const fixtures=[],day='2026-10-20';
function add(p,c,e={}){
 const expected=core.evaluate(p,{empresas:c?[c]:[]},{p:e},day);
 fixtures.push({person:p,company:c,exception:e,day,expected:{status:expected.status,motivos:expected.reasons,avisos:expected.warnings,excecao:expected.exception}});
}
for(const aso of ['','2026-10-19','2026-10-20','2030-12-31'])for(const integ of ['','2026-10-19','2030-12-31'])for(const sesmt of ['','2026-10-19','2030-12-31']){
 const p={id:'p',empresaId:'e',aso,integ},c={id:'e',contratoFim:'2030-12-31',docDPValidade:'2030-12-31',docSESMTValidade:sesmt};
 const result=core.evaluate(p,{empresas:[c]},{},day),ex={ativo:true,dataLiberacao:day,dataAte:day,pendenciasAutorizadas:[...result.reasons,...result.warnings]};
 add(p,c);add(p,c,ex);add(p,c,{...ex,ativo:false});add(p,c,{...ex,dataAte:'2026-10-19'});add(p,c,{...ex,pendenciasAutorizadas:[]});
}
add({id:'p',aso:'2030-12-31',integ:'2030-12-31'},null);
add({id:'p',empresaId:'e',aso:'2026-02-30',integ:'2030-12-31'},{id:'e',contratoFim:'2026-10-19',docDPValidade:'2026-10-20',docSESMTValidade:''});
const data=JSON.stringify(fixtures).replace(/'/g,"''");
const sql=`do $$ declare f jsonb; actual jsonb; n integer=0; begin for f in select * from jsonb_array_elements('${data}'::jsonb) loop actual=sst_private.access_v1(f->'person',nullif(f->'company','null'::jsonb),f->'exception',(f->>'day')::date); if (select jsonb_object_agg(k,v) from jsonb_each(actual) x(k,v) where k=any(array['status','motivos','avisos','excecao'])) is distinct from f->'expected' then raise exception 'Server/JS rule mismatch in synthetic fixture %',n;end if;n=n+1;end loop;end $$;select 'PASS: ${fixtures.length} synthetic server/JS access-rule cases' as result;`;
fs.writeFileSync(__dirname+'/access-parity.sql',sql+'\n');console.log('Generated '+fixtures.length+' server parity cases.');
