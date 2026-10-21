const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('../relatorios.js');const core=globalThis.sstRelatorioCore;
const company={id:'e',nome:'Empresa',contratoFim:'2030-12-31',docDPValidade:'2030-12-31',docSESMTValidade:'2030-12-31'};
const person={id:'p',nome:'Ana Alves',empresaId:'e',aso:'2026-10-20',integ:'2030-12-31'};
const state={empresas:[company],terceiros:[person]};
assert.equal(core.evaluate(person,state,{},'2026-10-20').status,'LIBERADO');
assert.equal(core.evaluate(person,state,{},'2026-10-21').status,'BLOQUEADO');
assert.equal(core.evaluate({...person,aso:''},state,{},'2026-10-20').status,'BLOQUEADO');
const pending={...person,aso:'2030-12-31',integ:''},s={...state,terceiros:[pending]};
const p=core.evaluate(pending,s,{},'2026-10-20');assert.equal(p.status,'PENDENTE');
const ex={ativo:true,dataLiberacao:'2026-10-20',dataAte:'2026-10-20',pendenciasAutorizadas:[...p.reasons,...p.warnings]};
assert.equal(core.evaluate(pending,s,{p:ex},'2026-10-20').status,'LIBERADO POR EXCEÇÃO');
assert.equal(core.evaluate(pending,s,{p:ex},'2026-10-21').status,'PENDENTE');
assert.equal(core.evaluate({...pending,aso:'2020-01-01'},s,{p:ex},'2026-10-20').status,'BLOQUEADO');
assert.equal(core.evaluate(pending,s,{p:{...ex,ativo:false}},'2026-10-20').status,'PENDENTE');
const snap={id:1,captured_at:'2026-10-20T18:00:00Z',state,exceptions:{},rule_version:'sst-access-v1',reason:'Marco inicial'};
const report={requested_from:'2026-10-19T03:00:00Z',effective_to_exclusive:'2026-10-22T03:00:00Z',snapshots:[snap]};
const rows=core.intervals(report);assert.equal(rows.length,2);assert.equal(rows[0].from,snap.captured_at.replace('Z','.000Z'));assert.equal(rows[0].status,'LIBERADO');assert.equal(rows[1].status,'BLOQUEADO');assert.equal(rows[1].from,'2026-10-21T03:00:00.000Z');
assert.equal(core.day('2026-10-21T02:59:59Z'),'2026-10-20');
assert.throws(()=>core.intervals({...report,snapshots:[{...snap,rule_version:'unknown'}]}),/não reconhecida/);
assert.equal(core.eventLabel({entity_type:'sst_excecoes',before_data:{dados:{ativo:true}},after_data:{dados:{ativo:false}}}),'AUTORIZAÇÃO CANCELADA');
assert.ok(core.csv([{...rows[0],name:'=HYPERLINK("x")'}]).includes('"\'=HYPERLINK(""x"")"'));
// Compare historical evaluator with the actual app rules, including exception coverage.
const html=require('./source-loader.cjs').inlineEquivalent(fs.readFileSync(__dirname+'/../index.html','utf8'));
const dp=html.slice(html.indexOf('  getStatusDP = function(t)'),html.indexOf('  const _renderDashboardV103'));
const base=html.slice(html.indexOf('  function getStatusBaseSemExcecao'),html.indexOf('  function statusImportadoLiberado'));
const finalStart=html.indexOf('  getStatus = function(t)',html.indexOf('  function statusImportadoNegado'));
const final=html.slice(finalStart,html.indexOf('  function salvarLiberacaoExcecao',finalStart));
let currentDay='2026-10-20',companies=[company],exceptions={};
const ctx=vm.createContext({getEmpresaById:id=>companies.find(e=>e.id===id),hoje:()=>currentDay,fmtData:v=>v.split('-').reverse().join('/'),statusData:v=>{if(!core.valid(v))return{semData:true,classe:'neutral'};const days=Math.round((Date.parse(v)-Date.parse(currentDay))/86400000);return {semData:false,classe:days<0?'blocked':days<=30?'warn':'ok',texto:days<0?'Vencido em '+v:'Válido até '+v,...(days>=0&&days<=30?{texto:'Vence em '+v.split('-').reverse().join('/')+' ('+days+' dia(s))'}:{})}},getExcecaoTerceiro:id=>{const ex=exceptions[id];return ex?.ativo&&ex.dataLiberacao<=currentDay&&ex.dataAte>=currentDay?ex:null;},normalizarTexto:v=>v});
vm.runInContext(dp+base+final,ctx);
for(const aso of ['', '2026-10-19','2026-10-20','2030-12-31'])for(const integ of ['', '2026-10-19','2030-12-31'])for(const sesmt of ['', '2026-10-19','2030-12-31']){
 companies=[{...company,docSESMTValidade:sesmt}];const t={...person,aso,integ};ctx.t=t;exceptions={};
 const actual=vm.runInContext('getStatus(t)',ctx);const calculated=core.evaluate(t,{empresas:companies},{},currentDay);
 assert.equal(calculated.status,actual.statusTexto);assert.deepEqual(calculated.reasons,JSON.parse(JSON.stringify(actual.motivos)));assert.deepEqual(calculated.warnings,JSON.parse(JSON.stringify(actual.avisos)));
 exceptions={p:{...ex,pendenciasAutorizadas:[...actual.motivos,...actual.avisos]}};
 assert.equal(core.evaluate(t,{empresas:companies},exceptions,currentDay).status,vm.runInContext('getStatus(t).statusTexto',ctx));
}
console.log('Report tests passed: 36 rule combinations, before/after expiry, exception validity/cancellation, coverage boundary, Brasília time, CSV safety.');
