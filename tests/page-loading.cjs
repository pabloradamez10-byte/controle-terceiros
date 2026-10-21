// Exercise actual external script/link loading, including delayed downloads.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
class Files extends ResourceLoader{
 fetch(url){
  const u=new URL(url);if(u.origin!=='https://sst.invalid')return null;
  const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return null;
  const wait=u.pathname.endsWith('/backend-sessao-usuarios.js')?400:5;
  return new Promise(resolve=>setTimeout(()=>resolve(fs.readFileSync(file)),wait));
 }
}
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://sst.invalid/',runScripts:'dangerously',resources:new Files(),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};w.alert=()=>{};w.fetch=()=>{throw Error('Anonymous page attempted backend fetch')};w.TextEncoder=TextEncoder;w.AbortController=AbortController;}});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Page loading timeout')),7000);dom.window.addEventListener('load',()=>{clearTimeout(timer);resolve()},{once:true});});
 await new Promise(r=>setTimeout(r,80));
 assert.deepEqual(errors,[]);assert.ok(dom.window.sstSecurityReady);assert.equal(dom.window.document.getElementById('tss-auth-overlay').hidden,false);assert.equal(dom.window.document.querySelectorAll('script:not([src])').length,0);
 assert.equal(typeof dom.window.abrirAnalise,'function');assert.equal(typeof dom.window.sstAbrirRelatorio,'function');
 dom.window.close();console.log('External page loading passed: ordered real files, delayed backend script, login wall and module initialization.');
})().catch(e=>{console.error(e);process.exitCode=1});
