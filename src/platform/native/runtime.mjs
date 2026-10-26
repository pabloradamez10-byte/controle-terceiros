import path from 'node:path';
import Corestore from 'corestore';
import Autobase from 'autobase';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import {MemberRequest} from 'blind-pairing-core';
import {SstDevice} from '../../backend/p2p/device.mjs';
import {SstSession} from '../../backend/p2p/session.mjs';
import {PROTOCOL,validKey} from '../../backend/p2p/protocol.mjs';
import {IdentityVault} from './identity-vault.mjs';
import {openDeviceConfig} from './device-files.mjs';
import {NativeFrontendService} from './frontend-service.mjs';
import {Pairing} from './pairing.mjs';
import {OperationJournal} from './journal.mjs';
import {Checkpoints} from './checkpoints.mjs';
import {privateJSON,readPrivateJSON,hex} from './sealed-store.mjs';

async function optional(file){try{return await readPrivateJSON(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function transport(directory){
 const file=path.join(directory,'transport.json');let pair=await optional(file);
 if(!pair){const keys=crypto.keyPair();pair={publicKey:hex(keys.publicKey),secretKey:hex(keys.secretKey)};keys.secretKey.fill(0);await privateJSON(file,pair,{exclusive:true});}
 const keys={publicKey:b4a.from(pair.publicKey,'hex'),secretKey:b4a.from(pair.secretKey,'hex')};
 if(!crypto.validateKeyPair(keys))throw Error('Identidade de rede inválida.');return keys;
}
export class DeviceRuntime{
 static async open(directory,options={}){const app=new DeviceRuntime(path.resolve(directory),options);await app.open();return app;}
 constructor(directory,options){this.directory=directory;this.options=options;this.queue=Promise.resolve();this.exports=new Map();this.pairing=new Pairing(options);this.closed=false;this.lastMaintenanceError=null;this.lastSyncAt=null;this.observedSignedLength=0;}
 enqueue(task){const next=this.queue.catch(()=>{}).then(task);this.queue=next;return next;}
 async open(){
   const active=await optional(path.join(this.directory,'active.json'));
   if(active&&(!/^joined-[a-f0-9]{32}$/.test(active.profile)))throw Error('Perfil local inválido.');
   await this.openProfile(active?path.join(this.directory,active.profile):this.directory);
 }
 async openProfile(directory){
   this.profile=directory;const settings=await openDeviceConfig(directory);
   this.device=await SstDevice.open({...settings.config,directory:settings.directory});
   this.device.transportPair=await transport(directory);
   this.device.trustedTransports=new Set(settings.config.trustedTransports??[]);
   const key=b4a.from(this.device.secret,'hex');
   this.journal=this.device.journal=new OperationJournal(path.join(directory,'pending'),key,'sst-journal:'+this.device.baseKey);
   this.checkpoints=new Checkpoints(path.join(directory,'checkpoints'),key,this.device.baseKey);key.fill(0);
   this.session=new SstSession(this.device,new IdentityVault(path.join(directory,'identities')));
   this.service=new NativeFrontendService(this.device,this.session);
   if((await optional(path.join(directory,'network.json')))?.enabled)await this.device.startNetwork(this.options.networkOptions);
 }
 artifact(filename,value,scope){if(this.exports.size>=64)this.exports.delete(this.exports.keys().next().value);const ref=hex(crypto.randomBytes(16));this.exports.set(ref,{filename,value,scope});return ref;}
 async admin(){const user=await this.session.require();if(user.role!=='admin'||await this.device.role()!=='admin')throw Error('Somente administrador pode executar esta operação.');return user;}
 async registerTransport(){
   await this.admin();
     const transportKey=hex(this.device.transportPair.publicKey);
     if(!await this.device.base.view.get('transport/'+transportKey))await this.service.confirmed(await this.device.append({kind:'transport',transportKey}));
 }
 async network(enabled){
   await this.admin();if(enabled)await this.registerTransport();
   await privateJSON(path.join(this.profile,'network.json'),{enabled});
   if(enabled)await this.device.startNetwork(this.options.networkOptions);
   else if(this.device.swarm){await this.device.swarm.destroy();this.device.swarm=null;this.device.connections.clear();}
   return {enabled};
 }
 async maintain(){
   await this.device.base.update();
   for(const socket of this.device.connections)if(!await this.device.transportAllowed(hex(socket.remotePublicKey)))socket.destroy();
   if(this.device.base.view.core.signedLength!==this.observedSignedLength){if(this.device.connections.size)this.lastSyncAt=new Date().toISOString();this.observedSignedLength=this.device.base.view.core.signedLength;}
   const signed=this.device.base.view.core.signedLength;
   if(this.device.swarm&&signed>0&&this.downloadEnd!==signed){
     this.downloadRange?.destroy();this.downloadEnd=signed;
     this.downloadRange=this.device.base.view.core.download({start:0,end:signed});this.downloadRange.done().catch(()=>{});
   }
   const drafts=await this.journal.reconcile(this.device);
   const backup=await this.checkpoints.capture(this.device);this.lastMaintenanceError=null;return {drafts,backup};
 }
 maintenance(){return this.enqueue(()=>this.maintain()).catch(()=>{this.lastMaintenanceError='Não foi possível atualizar a cópia ou as operações pendentes.';});}
 execute(request){return this.enqueue(()=>this.dispatch(request));}
 async dispatch({action,body={}}={}){
   if(this.closed)throw Error('Aplicativo encerrado.');
   if(action==='exportArtifact'){
     const item=this.exports.get(body.ref);if(!item)throw Error('Arquivo expirado. Gere outro arquivo.');
     if(item.scope==='admin')await this.admin();
     else if(item.scope==='candidate'){if(!this.pairing.candidate)throw Error('Pedido encerrado.');}
     else if((await this.session.require()).publicKey!==item.scope)throw Error('Arquivo pertence a outra sessão.');
     return {filename:item.filename,value:item.value};
   }
   if(action==='recoveryRestore'){
     if(await this.device.base.view.get('policy/owner')){const user=validKey(body.kit?.publicKey)?(await this.device.base.view.get('user/'+body.kit.publicKey))?.value:null;if(!user||user.name.toLowerCase()!==body.kit?.name)throw Error('O kit não corresponde a um usuário deste SST.');}
     const result=await this.session.vault.recover(body.kit,body.code,body.password);this.session.logout();return {...result,message:'Identidade recuperada. Entre com a nova senha; suas permissões continuam sendo verificadas.'};
   }
   if(action==='linkStatus')return {candidate:this.pairing.candidateStatus()};
   if(action==='linkPrepare'){
     if(await this.device.base.view.get('policy/owner'))throw Error('Use uma instalação sem grupo para vincular outro aparelho.');
     if(this.pairing.candidate)throw Error('Cancele o pedido anterior.');
     const directory=path.join(this.directory,'joined-'+hex(crypto.randomBytes(16))),vault=new IdentityVault(path.join(directory,'identities'));
     const account=body.kit?await vault.recover(body.kit,body.recoveryCode,body.password):await vault.create(body.name,body.password);
     const identity=await vault.unlock(account.name,body.password),store=new Corestore(path.join(directory,'store'));
     try{
       const writer=hex(await Autobase.getLocalKey(store)),keys=await transport(directory);
       try{const result=this.pairing.prepare(body.code,{writer,transportKey:hex(keys.publicKey),identity,name:account.name,label:body.label});this.joinDirectory=directory;return {...result,exportRef:this.artifact('sst-pedido.json',{request:result.request},'candidate')};}
       finally{keys.secretKey.fill(0);}
     }finally{identity.secretKey.fill(0);await store.close();}
   }
   if(action==='linkSubmit')return this.pairing.submit(body.code,body.online!==false);
   if(action==='linkResponse')return this.pairing.response(body.response);
   if(action==='linkComplete'){
     const auth=this.pairing.auth(),extra=JSON.parse(b4a.toString(auth.data));
     if(!validKey(extra.sponsorTransport)||!this.joinDirectory)throw Error('Resposta de vinculação inválida.');
     const config={protocol:PROTOCOL,invitation:{protocol:PROTOCOL,baseKey:hex(auth.key),encryptionKey:hex(auth.encryptionKey)},trustedTransports:[extra.sponsorTransport]};
     await privateJSON(path.join(this.joinDirectory,'device.json'),config,{exclusive:true});
     await privateJSON(path.join(this.joinDirectory,'network.json'),{enabled:this.pairing.candidate.online!==false},{exclusive:true});
     // The old profile is retained; only the pointer is changed after the accepted config is durable.
     await privateJSON(path.join(this.directory,'active.json'),{profile:path.basename(this.joinDirectory)});
     await this.closeProfile();await this.openProfile(this.joinDirectory);await this.pairing.close();this.joinDirectory=null;
     return {linked:true,message:'Aparelho vinculado. Aguarde a primeira sincronização e entre com sua senha.'};
   }
   if(action==='linkCancel'){if(this.pairing.invite)await this.admin();await this.pairing.close();this.joinDirectory=null;return {cancelled:true};}
   if(action==='status')return {...await this.service.execute({action}),joining:this.device.writerKey!==this.device.baseKey&&!await this.device.base.view.get('policy/owner')};
   if(action==='syncStatus'){
     await this.session.require({touch:false});await this.device.base.update();const drafts=await this.journal.reconcile(this.device);
     return {...this.device.status(),drafts:drafts.map(({id,state,reason,createdAt})=>({id,state,reason,createdAt})),checkpoints:await this.checkpoints.list(),lastSyncAt:this.lastSyncAt,maintenanceError:this.lastMaintenanceError};
   }
   if(action==='draftPreview'||action==='draftRetry'){
     const membership=await this.service.membership(),user=await this.session.require();
     if(!membership.permissoes.cadastrar)throw Error('Perfil sem permissão para revisar alterações.');
     const row=await this.journal.get(body.id);
     if(row.operation.actor!==user.publicKey&&membership.role!=='admin')throw Error('Rascunho pertence a outra pessoa.');
     const mutations=row.operation.mutations??(row.operation.entity?[row.operation]:[]),snapshot=await this.service.snapshot();
     const canRetry=row.state==='conflict'&&mutations.length>0&&mutations.every(m=>['empresas','terceiros','treinamentos'].includes(m.entity));
     if(action==='draftPreview')return {state:row.state,reason:row.reason,expected:snapshot.version,canRetry,changes:mutations.map(m=>({entity:m.entity,id:m.recordId,requested:m.kind==='delete'?null:m.value,current:snapshot.rows.get(m.entity+'/'+m.recordId)?.value??null}))};
     if(!canRetry||body.confirm!==true||body.expected!==snapshot.version)throw Error('Confira uma nova prévia do conflito antes de reenviar.');
     for(const mutation of mutations){const list=snapshot.state[mutation.entity],index=list.findIndex(record=>String(record.id)===mutation.recordId);if(mutation.kind==='delete'){if(index>=0)list.splice(index,1);}else if(index>=0)list[index]=mutation.value;else list.push(mutation.value);}
     await this.checkpoints.capture(this.device);
     const version=await this.service.saveState(snapshot.state,snapshot.version,body.reason);
     row.reviewedAt=new Date().toISOString();await this.journal.put(body.id,row);await this.checkpoints.capture(this.device);return {version,retried:true};
   }
   if(action==='recoveryCreate'){
     const user=await this.session.require();const result=await this.session.vault.recoveryKit(user.name,body.password);
     if(result.kit.publicKey!==user.publicKey)throw Error('Identidade diferente da sessão.');return {...result,exportRef:this.artifact('sst-identidade.json',result.kit,user.publicKey)};
   }
   if(['network','linkInvite','linkRequests','linkImportRequest','linkApprove','linkDeny','devices','revokeDevice','handover','backupCreate','backupPreview','backupRestore'].includes(action)){
     await this.admin();
     if(action==='network')return this.network(body.enabled===true);
     if(action==='linkInvite'){if(body.online===false)await this.registerTransport();else await this.network(true);const result=this.pairing.create(this.device.baseKey,hex(this.device.transportPair.publicKey));if(body.online!==false)this.pairing.listen();return {...result,exportRef:this.artifact('sst-convite.json',{code:result.code},'admin')};}
     if(action==='linkRequests')return this.pairing.requests();
     if(action==='linkImportRequest'){
       if(typeof body.request!=='string'||body.request.length>16000||!/^[a-f0-9]+$/.test(body.request))throw Error('Pedido inválido.');
       this.pairing.receive(MemberRequest.from(b4a.from(body.request,'hex'))).catch(()=>{});return this.pairing.requests();
     }
     if(action==='linkApprove'){const result=await this.pairing.approve(body.id,body.code,body.role,body.userRole,this.device,this.session);return {...result,exportRef:this.artifact('sst-resposta.json',{response:result.response},'admin')};}
     if(action==='linkDeny')return this.pairing.deny(body.id);
     if(action==='devices'){
       const rows=[{writer:this.device.baseKey,role:'admin',label:'Aparelho criador'}];
       for await(const{key,value}of this.device.base.view.createReadStream({gte:'member/',lt:'member0'}))rows.push({writer:key.slice(7),...value});
       return [...new Map(rows.map(row=>[row.writer,row])).values()].map(row=>({...row,current:row.writer===this.device.writerKey}));
     }
     if(action==='revokeDevice'){
       if(body.writer===this.device.writerKey)throw Error('Revogue este aparelho usando outro administrador.');
       const result=await this.device.grant(body.writer,null);await this.service.confirmed(result);
       for(const socket of this.device.connections){const entry=await this.device.base.view.get('transport/'+hex(socket.remotePublicKey));if(entry?.value.writer===body.writer)socket.destroy();}
       return {revoked:true,message:'Novas operações serão recusadas após a propagação. Cópias já recebidas não são apagadas remotamente.'};
     }
     if(action==='handover'){await this.service.confirmed(await this.device.append({kind:'handover',writer:body.writer}));return {transferred:true};}
     if(action==='backupCreate')return this.checkpoints.capture(this.device);
     if(action==='backupPreview'){const preview=await this.checkpoints.preview(body.id,this.device);return {...preview,mutations:undefined,expected:(await this.service.snapshot()).version};}
     if(action==='backupRestore'){
       if(body.confirm!==true||typeof body.reason!=='string'||body.reason.trim().length<3)throw Error('Confirme a prévia e informe o motivo da recuperação.');
       if(body.expected!==(await this.service.snapshot()).version)throw Error('A base mudou. Confira uma nova prévia.');
       const preview=await this.checkpoints.preview(body.id,this.device);if(!preview.mutations.length)return {restored:0};
       const safety=await this.checkpoints.capture(this.device);if(!safety.saved)throw Error('Aguarde a confirmação para preservar uma cópia antes de restaurar.');
       await this.service.confirmed(await this.device.commit(preview.mutations,body.reason));await this.checkpoints.capture(this.device);
       return {restored:preview.mutations.length,restoredAccessExceptions:false};
     }
   }
   // Keep a confirmed checkpoint before and after user writes; backups never change authorizations.
   const writes=['saveState','saveException','documents'];
   if(writes.includes(action)&&action!=='documents'||action==='documents'&&body.action==='upload'){
     await this.session.require();await this.checkpoints.capture(this.device);
     const result=await this.service.execute({action,body});await this.checkpoints.capture(this.device);return result;
   }
   return this.service.execute({action,body});
 }
 async closeProfile(){this.downloadRange?.destroy();this.downloadRange=null;this.downloadEnd=0;this.session?.logout();await this.device?.close();this.device?.transportPair?.secretKey.fill(0);this.journal?.close();this.checkpoints?.close();}
 async close(){await this.queue.catch(()=>{});this.closed=true;await this.pairing.close();await this.closeProfile();}
}
