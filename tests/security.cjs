const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
async function main(){
 const dom=new JSDOM('<!doctype html><body><main></main></body>',{url:'https://sst.invalid/controle-terceiros/',runScripts:'outside-only'}),w=dom.window;
 w.localStorage.setItem('terceiros','old-sensitive');w.localStorage.setItem('unrelated','keep');const nativeGet=w.Storage.prototype.getItem;
 w.eval(read('vendor/purify-3.4.17.min.js'));w.eval(read('security.js'));
 assert.equal(w.sstSecurityReady,true);assert.equal(w.localStorage.getItem('terceiros'),null);assert.equal(w.localStorage.getItem('unrelated'),'keep');
 w.localStorage.setItem('terceiros','private-runtime');assert.equal(w.localStorage.getItem('terceiros'),'private-runtime');assert.equal(nativeGet.call(w.localStorage,'terceiros'),null);
 const box=w.document.querySelector('main');
 const attacks=['<img src=x onerror="window.attack=1">','<svg onload="window.attack=1"></svg>','<a href="javascript:window.attack=1">Open</a>','<script>window.attack=1</script>','<button onclick="abrirAnalise(\'x\');window.attack=1;(\'\')">Bad</button>','<iframe src="data:text/html;base64,PHNjcmlwdD4="></iframe>'];
 for(const attack of attacks){box.innerHTML=attack;assert.equal(box.querySelector('script'),null);assert.equal(box.querySelector('iframe'),null);for(const el of box.querySelectorAll('*'))for(const a of el.attributes)assert.ok(!/^on/i.test(a.name)&&!/^javascript:/i.test(a.value));}
 let page=null,id=null;w.showPage=x=>page=x;w.abrirAnalise=x=>id=x;
 box.innerHTML='<button onclick="showPage(\'dashboard\')">Go</button>';box.querySelector('button').click();assert.equal(page,'dashboard');
 box.innerHTML='<button onclick="abrirAnalise(\'abc-123\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){abrirAnalise(\'key-id\')}">Open</button>';box.querySelector('button').click();assert.equal(id,'abc-123');box.querySelector('button').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(id,'key-id');
 assert.throws(()=>w.sstSafeDocumentURL('javascript:alert(1)'));assert.throws(()=>w.sstSafeDocumentURL('data:text/html;base64,AAAA'));assert.equal(w.sstSafeDocumentURL('data:application/pdf;base64,JVBERg=='),'data:application/pdf;base64,JVBERg==');
 box.innerHTML='<iframe src="data:application/pdf;base64,JVBERg=="></iframe>';assert.equal(box.querySelector('iframe').getAttribute('sandbox'),'');
 w.sessionStorage.setItem('tss_auth_session','private-token');w.sstClearPrivateData();assert.equal(w.localStorage.getItem('terceiros'),null);assert.equal(w.sessionStorage.getItem('tss_auth_session'),null);assert.equal(w.localStorage.getItem('unrelated'),'keep');dom.window.close();
 // Service worker: only public app assets, never APIs, credentials or arbitrary URLs.
 const handlers={},cached=[],removed=[];let responsePromise,fail=false,ok=true;
 const cache={addAll:async()=>{},put:async(req)=>cached.push(req.url),match:async()=>null};
 const sw={self:{registration:{scope:'https://sst.invalid/controle-terceiros/'},skipWaiting(){},clients:{claim:async()=>{}},addEventListener:(name,f)=>handlers[name]=f},URL,Request,Headers,Error,caches:{open:async()=>cache,keys:async()=>['other-app','portal-terceiros-sst-old'],delete:async k=>removed.push(k),match:async()=>null},fetch:async()=>{if(fail)throw Error('offline');return new Response('public',{status:ok?200:500})}};
 vm.runInNewContext(read('service-worker.js'),sw);
 for(const req of [new Request('https://db.invalid/rest/v1/app_data'),new Request('https://sst.invalid/controle-terceiros/index.html',{headers:{Authorization:'Bearer fixture'}}),new Request('https://sst.invalid/private'),new Request('https://sst.invalid/controle-terceiros/index.html',{method:'POST'})]){let intercepted=false;handlers.fetch({request:req,respondWith(){intercepted=true;}});assert.equal(intercepted,false);}
 const work=[];handlers.fetch({request:new Request('https://sst.invalid/controle-terceiros/index.html'),respondWith:p=>responsePromise=p,waitUntil:p=>work.push(p)});await responsePromise;await Promise.all(work);assert.equal(cached.length,1);
 ok=false;handlers.fetch({request:new Request('https://sst.invalid/controle-terceiros/index.html'),respondWith:p=>responsePromise=p,waitUntil:p=>work.push(p)});await responsePromise;assert.equal(cached.length,1);
 let activated;handlers.activate({waitUntil:p=>activated=p});await activated;assert.deepEqual(removed,['portal-terceiros-sst-old']);
 // CSP permits only the exact inline script bodies and disables inline event handlers.
 const html=read('index.html'),policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];assert.ok(policy.includes("script-src-attr 'none'"));assert.ok(!policy.match(/script-src [^;]*'unsafe-inline'/));assert.ok(!policy.includes("'unsafe-eval'"));
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(m[1].trim())assert.ok(policy.includes("'sha256-"+crypto.createHash('sha256').update(m[1]).digest('base64')+"'"),'Inline CSP hash out of date');
 assert.equal([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(m=>m[1].trim()).length,0,'No application JavaScript in HTML');
 // Real application scripts, fake authenticated backend: render, navigation and logout.
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!e.message.includes('navigation'))errors.push(e.message)});
 const app=new JSDOM(html,{url:'https://sst.invalid/controle-terceiros/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),a=app.window;
 a.scrollTo=()=>{};a.alert=()=>{};a.confirm=()=>true;a.prompt=()=> 'Teste de segurança';a.TextEncoder=TextEncoder;a.AbortController=AbortController;
 const requests=[],state={schema:'controle-terceiros-sst-v2',updatedAt:'2026-10-21T12:00:00Z',updatedBy:'fixture',terceiros:[{id:'p1',nome:'Ana <img src=x onerror="window.attack=1">',cpf:'11111111111',empresaId:'e1',empresa:'Empresa teste',funcao:'Teste',aso:'2030-01-01',integ:'2030-01-01'}],empresas:[{id:'e1',nome:'Empresa teste',contratoFim:'2030-01-01',docDPValidade:'2030-01-01',docSESMTValidade:'2030-01-01'}],treinamentos:[],historico:[],anexosTerceiros:{},anexosEmpresas:{},arquivosTerceirosV16:{},arquivosEmpresasV26:{}};
 a.fetch=async(url,options={})=>{requests.push({url,options});let body;if(url.includes('/auth/v1/user'))body={id:'fixture-user',email:'fixture@example.invalid'};else if(url.includes('/sst_members?'))body=[{role:'admin',ativo:true,permissoes:{consultar:true,cadastrar:true,liberar:true}}];else if(url.endsWith('/rpc/sst_read_state'))body=[{key:'controle_terceiros_sst_state_v1',data:state,updated_at:'2026-10-21T12:00:00'}];else if(url.endsWith('/rpc/sst_read_exceptions'))body=[];else if(url.endsWith('/rpc/sst_access_now'))body={rule_version:'sst-access-v1',generated_at:'2026-10-21T12:00:00Z',server_day:'2026-10-21',state_version:'2026-10-21T12:00:00',statuses:{p1:{status:'LIBERADO',ok:true,motivos:[],avisos:[],dp:{motivos:[],avisos:[]},sesmt:{motivos:[],avisos:[]}}}};else if(url.includes('/auth/v1/logout'))body={};else throw Error('Unexpected request '+url);return {ok:true,status:200,json:async()=>body,text:async()=>JSON.stringify(body)}};
 a.sessionStorage.setItem('tss_auth_session',JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600}));
 a.eval(read('vendor/purify-3.4.17.min.js'));a.eval(read('security.js'));a.eval(read('access.js'));a.eval(read('vendor/xlsx-0.20.3.full.min.js'));
 for(const script of a.document.querySelectorAll('script[src^="./assets/js/"]'))a.eval(read(script.getAttribute('src').slice(2)));
 a.eval(read('documentos.js'));a.eval(read('relatorios.js'));
 a.document.dispatchEvent(new a.Event('DOMContentLoaded'));await new Promise(r=>setTimeout(r,180));
 assert.equal(a.document.body.classList.contains('tss-authenticated'),true,errors.join('\n'));
 a.abrirAnalise('p1');assert.equal(a.document.querySelector('#analise-conteudo img'),null);assert.equal(a.document.querySelector('[onerror]'),null);assert.equal(a.attack,undefined);
 const nav=[...a.document.querySelectorAll('nav button')].find(b=>b.textContent==='Terceiros');nav.click();assert.ok(a.document.getElementById('page-listagem').classList.contains('active'));
 assert.ok(requests.some(r=>r.url.endsWith('/rpc/sst_read_state')&&r.options.method==='POST'));assert.ok(requests.every(r=>r.options.cache==='no-store'));
 await a.tssSair();assert.equal(a.localStorage.getItem('terceiros'),null);assert.equal(a.sessionStorage.getItem('tss_auth_session'),null);assert.equal(a.document.querySelector('main').textContent,'');assert.ok(requests.some(r=>r.url.includes('/auth/v1/logout?scope=local')));
 assert.deepEqual(errors,[]);app.window.close();
 // Updated import library round trip, including dangerous strings as plain cell text.
 const x=require('../vendor/xlsx-0.20.3.full.min.js');assert.equal(x.version,'0.20.3');const wb=x.utils.book_new();x.utils.book_append_sheet(wb,x.utils.aoa_to_sheet([['Nome','CPF'],['Ana Alves','00123456789'],['<img onerror=1>','00000000000']]),'Terceiros');const parsed=x.read(x.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});assert.equal(x.utils.sheet_to_json(parsed.Sheets.Terceiros,{header:1})[1][1],'00123456789');
 console.log('Security passed: XSS/HTML sinks, finite button actions, private memory/logout, cache boundaries, CSP, authenticated app rendering/navigation and XLSX round trip.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
