import{test}from'node:test';import assert from'node:assert/strict';import{mkdtemp,rm,readFile}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';import{createRequire}from'node:module';import{DeviceRuntime}from'../../src/platform/native/runtime.mjs';
const require=createRequire(import.meta.url),{JSDOM,VirtualConsole}=require('jsdom'),password='Senha-ficticia-2026',assets=process.env.SST_TEST_OCR_ASSETS;
const wait=async check=>{const end=Date.now()+10000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,20));}assert.fail('Tela de gestão não concluiu.');};
test('native management screens use real recovery and invitation services and scrub codes on logout',{skip:!assets},async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'sst-management-')),out=path.join(dir,'ui'),runtime=await DeviceRuntime.open(path.join(dir,'device'),{networkOptions:{bootstrap:[]}});
 require('../../scripts/p2p/build-ui.cjs').buildNativeUI({assets,out});
 const html=await readFile(path.join(out,'index.html'),'utf8'),dom=new JSDOM(html,{url:'https://sst-device.invalid',runScripts:'outside-only',virtualConsole:new VirtualConsole()}),w=dom.window;
 t.after(async()=>{w.close();await runtime.close();await rm(dir,{recursive:true,force:true});});
 w.sstNativeHost={request:request=>runtime.execute(request)};w.alert=()=>{};w.confirm=()=>true;w.prompt=()=> 'Teste fictício';
 for(const match of html.matchAll(/<script[^>]+src="([^"?]+)[^"]*"[^>]*>/g)){
  if(match[1].includes('native-bridge'))continue;const source=await readFile(path.join(out,match[1]),'utf8');w.eval(source);
 }
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 await wait(()=>w.document.getElementById('sst-native-initialize'));
 w.document.getElementById('tss-auth-email').value='owner@sst.local';w.document.getElementById('tss-auth-password').value=password;w.document.getElementById('sst-native-initialize').click();
 await wait(()=>w.document.body.classList.contains('tss-authenticated'));
 const click=text=>{const button=[...w.document.querySelectorAll('button')].find(b=>b.textContent===text&&!b.closest('[hidden]'));assert.ok(button,text);button.click();};
 click('Proteger meu acesso');
 const dialog=w.document.querySelector('.sst-sensitive-dialog');dialog.querySelector('input[type=password]').value=password;click('Gerar arquivo e código');
 await wait(()=>[...dialog.querySelectorAll('textarea')].some(el=>el.value.length===64));
 const recoveryCode=dialog.querySelector('textarea').value;assert.ok(recoveryCode);
 const exported=[...runtime.exports.values()].find(row=>row.filename==='sst-identidade.json');assert.equal(exported.value.publicKey,(await runtime.device.user()).publicKey);
 assert.ok(!JSON.stringify(exported).includes(password));dialog.remove();
 click('Aparelhos e cópias');await wait(()=>[...w.document.querySelectorAll('button')].some(b=>b.textContent==='Criar convite para envio por arquivo'));
 click('Criar convite para envio por arquivo');await wait(()=>w.document.querySelector('.sst-sensitive-dialog img'));
 const image=w.document.querySelector('.sst-sensitive-dialog img');assert.ok(image.src.startsWith('data:image/gif;base64,'));
 const invite=[...w.document.querySelectorAll('textarea')].find(el=>el.value.startsWith('sst-link-v1:'));assert.ok(invite);
 await w.tssSair();assert.equal(w.document.querySelector('main').textContent,'');assert.equal(w.document.querySelectorAll('.sst-sensitive-dialog input,.sst-sensitive-dialog textarea').length,0);assert.ok(!w.document.body.textContent.includes(recoveryCode));assert.ok(!w.document.body.textContent.includes(invite.value));
});
