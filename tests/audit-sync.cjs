const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./source-loader.cjs').inlineEquivalent(fs.readFileSync(__dirname+'/../index.html','utf8'));
const block=html.slice(html.indexOf('  let auditBaseline = null'),html.indexOf('\n  function scheduleRemoteSync'));
let local={schema:'test',terceiros:[{id:'1',nome:'Ana'}]}, prompts=0,writes=0,reason='Correção cadastral',fail=false,scheduled=0;
const ctx=vm.createContext({JSON,Object,Error,isApplyingRemote:false,can:()=>true,readLocalState:()=>structuredClone(local),prompt:()=>{prompts++;return reason},SUPABASE_URL:'test',authorizedFetch:async(_,opts)=>{writes++;const data=JSON.parse(opts.body);assert.equal(data.p_reason,'Correção cadastral');assert.equal(data.p_expected,'stamp');return {ok:!fail,json:async()=>fail?{message:'Conflito'}:'next'}},localStorage:{setItem(){}},LOCAL_SYNC_MARK:'s',LOCAL_CHANGE_MARK:'c',applyRemoteState:s=>{local=structuredClone(s)},renderEverythingSafe(){},scheduleRemoteSync:()=>scheduled++});
vm.runInContext(block,ctx);
const run=s=>vm.runInContext(s,ctx);
(async()=>{
 run(`auditBaseline={terceiros:[{nome:'Ana',id:'1'}],schema:'test'};auditStamp='stamp'`);
 await run('saveRemoteState()');assert.equal(writes,0,'JSON key ordering must not cause an edit');assert.equal(prompts,0);
 local.terceiros[0].nome='Ana Alves';await Promise.all([run('saveRemoteState()'),run('saveRemoteState()')]);assert.equal(writes,1);assert.equal(prompts,1,'one prompt for concurrent sync calls');
 reason=null;local.terceiros[0].nome='Cancelada';await assert.rejects(run('saveRemoteState()'),/cancelada/);assert.equal(local.terceiros[0].nome,'Ana Alves');assert.equal(writes,1);
 reason='Correção cadastral';fail=true;run(`auditStamp='stamp'`);local.terceiros[0].nome='Conflito';await assert.rejects(run('saveRemoteState()'),/Conflito/);assert.equal(run('auditStamp'),'stamp','failed save cannot advance the baseline');
 console.log('Audit sync: unchanged, serialized save, cancellation and failed write passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
