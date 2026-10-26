import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {DeviceRuntime} from '../../src/platform/native/runtime.mjs';
const password='Senha-ficticia-2026';
const options={networkOptions:{bootstrap:[]}};
const owner=runtime=>runtime.execute({action:'initializeOwner',body:{email:'owner@sst.local',password}});
async function until(check,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,30));}assert.fail('Estado não convergiu.');}
function connect(a,b){const l=a.device.replicationStream(true),r=b.device.replicationStream(false);l.on('error',()=>{});r.on('error',()=>{});l.pipe(r).pipe(l);return()=>{l.destroy();r.destroy();};}

test('runtime recovery preserves identity, permissions and data; checkpoints recover deletion without reviving exceptions',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'sst-runtime-'));let runtime=await DeviceRuntime.open(dir,options);
 t.after(async()=>{await runtime.close();await rm(dir,{recursive:true,force:true});});await owner(runtime);
 const key=(await runtime.device.user()).publicKey;
 let state=(await runtime.execute({action:'state'}))[0];state.data.empresas.push({id:'e1',razao:'Empresa fictícia'});
 await runtime.execute({action:'saveState',body:{p_data:state.data,p_expected:state.updated_at,p_reason:'Criar empresa fictícia'}});
 const saved=await runtime.execute({action:'backupCreate'});assert.equal(saved.saved,true);
 const snapshot=await runtime.checkpoints.get(saved.id),objectFile=runtime.checkpoints.objects.file(snapshot.objects[0]),originalObject=await readFile(objectFile,'utf8');
 const corrupted=JSON.parse(originalObject);corrupted.ciphertext=(corrupted.ciphertext[0]==='0'?'1':'0')+corrupted.ciphertext.slice(1);await writeFile(objectFile,JSON.stringify(corrupted));
 await assert.rejects(runtime.execute({action:'backupPreview',body:{id:saved.id}}));assert.equal((await runtime.execute({action:'state'}))[0].data.empresas.length,1);await writeFile(objectFile,originalObject);
 const recovery=await runtime.execute({action:'recoveryCreate',body:{password}});
 assert.ok(!JSON.stringify(recovery.kit).includes(password));
 await runtime.execute({action:'logout'});
 await assert.rejects(runtime.execute({action:'recoveryRestore',body:{kit:recovery.kit,code:'0'.repeat(64),password:'Nova-senha-ficticia'}}));
 await runtime.execute({action:'recoveryRestore',body:{kit:recovery.kit,code:recovery.code,password:'Nova-senha-ficticia'}});
 await runtime.execute({action:'login',body:{email:'owner@sst.local',password:'Nova-senha-ficticia'}});
 assert.equal((await runtime.device.user()).publicKey,key);
 state=(await runtime.execute({action:'state'}))[0];assert.equal(state.data.empresas.length,1);state.data.empresas=[];
 await runtime.execute({action:'saveState',body:{p_data:state.data,p_expected:state.updated_at,p_reason:'Excluir empresa fictícia'}});
 const preview=await runtime.execute({action:'backupPreview',body:{id:saved.id}});assert.equal(preview.records.length,1);
 await runtime.execute({action:'backupRestore',body:{id:saved.id,expected:preview.expected,reason:'Recuperar empresa de teste',confirm:true}});
 assert.equal((await runtime.execute({action:'state'}))[0].data.empresas[0].id,'e1');
 const files=await runtime.journal.ids();assert.ok(files.length>0);assert.ok(!(await readFile(runtime.journal.file(files[0]),'utf8')).includes('Empresa fictícia'));
 await runtime.close();runtime=await DeviceRuntime.open(dir,options);await runtime.execute({action:'login',body:{email:'owner@sst.local',password:'Nova-senha-ficticia'}});assert.equal((await runtime.device.user()).publicKey,key);
});

test('single-use encrypted invitation requires matching codes and admin; paired Portaria cannot write/export and can be revoked',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'sst-link-')),a=await DeviceRuntime.open(path.join(dir,'a'),options),b=await DeviceRuntime.open(path.join(dir,'b'),options);let disconnect=()=>{};
 t.after(async()=>{disconnect();await a.close();await b.close();await rm(dir,{recursive:true,force:true});});await owner(a);
 const invite=await a.execute({action:'linkInvite',body:{online:false}});assert.ok(invite.qrDataUrl.startsWith('data:image/gif;base64,'));assert.ok(!invite.code.includes(a.device.secret));
 const prepared=await b.execute({action:'linkPrepare',body:{code:invite.code,name:'portaria@sst.local',label:'Portaria fictícia',password}});
 await assert.rejects(b.execute({action:'linkSubmit',body:{code:'errado'}}));
 await b.execute({action:'linkSubmit',body:{code:prepared.code,online:false}});
 const pending=await a.execute({action:'linkImportRequest',body:{request:prepared.request}});assert.equal(pending.length,1);assert.equal(pending[0].code,prepared.code);
 await assert.rejects(a.execute({action:'linkApprove',body:{id:pending[0].id,code:'errado',role:'portaria',userRole:'portaria'}}));
 const approved=await a.execute({action:'linkApprove',body:{id:pending[0].id,code:prepared.code,role:'portaria',userRole:'portaria'}});assert.equal(approved.approved,true);
 await assert.rejects(a.execute({action:'linkApprove',body:{id:pending[0].id,code:prepared.code,role:'admin',userRole:'admin'}}));
 await b.execute({action:'linkResponse',body:{response:approved.response}});await b.execute({action:'linkComplete'});
 disconnect=connect(a,b);await until(async()=>{await b.device.base.update();return !!await b.device.base.view.get('policy/owner');});
 await b.execute({action:'login',body:{email:'portaria@sst.local',password}});
 assert.equal((await b.execute({action:'membership'})).role,'portaria');
 await assert.rejects(b.execute({action:'saveState',body:{}}),/permissão/);
 for(const action of ['linkInvite','backupPreview','backupCreate','devices','network'])await assert.rejects(b.execute({action,body:{}}),/administrador/);
 await a.execute({action:'revokeDevice',body:{writer:b.device.writerKey}});
 await until(async()=>{await b.device.base.update();return (await b.device.base.view.get('member/'+b.device.writerKey))?.value?.role===null;});
 await assert.rejects(b.execute({action:'state'}),/revogado/);
});

async function enrollAdmin(a,b){
 const invite=await a.execute({action:'linkInvite',body:{online:false}});
 const prepared=await b.execute({action:'linkPrepare',body:{code:invite.code,name:'second@sst.local',label:'Segundo aparelho',password}});
 await b.execute({action:'linkSubmit',body:{code:prepared.code,online:false}});
 const [request]=await a.execute({action:'linkImportRequest',body:{request:prepared.request}});
 const approved=await a.execute({action:'linkApprove',body:{id:request.id,code:prepared.code,role:'admin',userRole:'admin'}});
 await b.execute({action:'linkResponse',body:{response:approved.response}});await b.execute({action:'linkComplete'});
 const pair=await b.session.vault.unlock('second@sst.local',password),userKey=pair.publicKey.toString('hex');pair.secretKey.fill(0);
 const disconnect=connect(a,b);await until(async()=>{await b.device.base.update();return b.device.base.writable&&!!await b.device.base.view.get('user/'+userKey);});
 await b.execute({action:'login',body:{email:'second@sst.local',password}});return disconnect;
}

test('offline signed intent survives process reopen and converges; planned indexer handover permits confirmed writes with creator off', {timeout:30000},async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'sst-handover-'));let a=await DeviceRuntime.open(path.join(dir,'a'),options),b=await DeviceRuntime.open(path.join(dir,'b'),options),disconnect=()=>{};
 t.after(async()=>{disconnect();await a.close();await b.close();await rm(dir,{recursive:true,force:true});});await owner(a);disconnect=await enrollAdmin(a,b);disconnect();
 const pending=await b.device.put('empresas','offline',{razao:'Intenção offline'});assert.equal(pending.finalized,false);
 await b.close();b=await DeviceRuntime.open(path.join(dir,'b'),options);await b.execute({action:'login',body:{email:'second@sst.local',password}});
 assert.ok((await b.journal.ids()).includes(pending.id));
 disconnect=connect(a,b);await until(async()=>{await b.device.base.update();await a.device.base.update();return (await b.device.receipt(pending.id)).finalized;});
 assert.equal((await a.device.get('empresas','offline')).value.razao,'Intenção offline');
 await b.maintenance();assert.equal((await b.journal.get(pending.id)).state,'confirmed');
 await a.execute({action:'handover',body:{writer:b.device.writerKey}});
 await until(async()=>{await b.device.base.update();return b.device.base.isIndexer;});
 disconnect();await a.close();a=await DeviceRuntime.open(path.join(dir,'a'),options); // Creator stays disconnected and locked.
 const result=await b.device.put('empresas','without-creator',{razao:'Criador desconectado'});await b.service.confirmed(result);
 assert.equal((await b.device.get('empresas','without-creator')).value.razao,'Criador desconectado');
 disconnect=connect(a,b);await until(async()=>{await a.device.base.update();return !!await a.device.get('empresas','without-creator');});
 await b.execute({action:'revokeDevice',body:{writer:a.device.writerKey}});await until(async()=>{await a.device.base.update();return await a.device.role()===null;});
 await assert.rejects(a.execute({action:'login',body:{email:'owner@sst.local',password}}),/AUTH_ACCESS/);assert.equal(await b.device.transportAllowed(a.device.transportPair.publicKey.toString('hex')),false);
});

test('real local DHT discovers paired devices and replicates over authenticated Hyperswarm sockets', {skip:process.env.SST_TEST_DHT!=='1',timeout:90000},async t=>{
 const {default:createTestnet}=await import('hyperdht/testnet.js');const net=await createTestnet(3);
 const opts={networkOptions:{bootstrap:net.bootstrap,firewalled:false}},dir=await mkdtemp(path.join(tmpdir(),'sst-real-dht-'));
 let a,b;
 t.after(async()=>{await a?.close();await b?.close();await net.destroy();await rm(dir,{recursive:true,force:true});});
 a=await DeviceRuntime.open(path.join(dir,'a'),opts);b=await DeviceRuntime.open(path.join(dir,'b'),opts);await owner(a);
 const invite=await a.execute({action:'linkInvite'}),prepared=await b.execute({action:'linkPrepare',body:{code:invite.code,name:'network@sst.local',label:'Segundo nó DHT',password}});
 await b.execute({action:'linkSubmit',body:{code:prepared.code}});
 await until(async()=>(await a.execute({action:'linkRequests'})).length>0,60000);
 const [request]=await a.execute({action:'linkRequests'});await a.execute({action:'linkApprove',body:{id:request.id,code:prepared.code,role:'admin',userRole:'admin'}});
 await until(async()=>(await b.execute({action:'linkStatus'})).candidate?.state==='accepted',60000);await b.execute({action:'linkComplete'});
 await until(async()=>{await b.device.base.update();return !!await b.device.base.view.get('policy/owner');},60000);
 await b.execute({action:'login',body:{email:'network@sst.local',password}});
 assert.ok(a.device.connections.size>0&&b.device.connections.size>0);
 await a.service.confirmed(await a.device.put('empresas','network-company',{razao:'Empresa via DHT real'}));
 await until(async()=>{await b.device.base.update();return !!await b.device.get('empresas','network-company');},60000);
 await a.maintenance();await b.maintenance();
 assert.equal((await b.device.get('empresas','network-company')).value.razao,'Empresa via DHT real');
 assert.ok((await b.checkpoints.list()).length>0);
});
