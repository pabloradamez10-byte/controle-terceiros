import path from 'node:path';
import canonicalize from 'canonicalize';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import {SealedStore,hex} from './sealed-store.mjs';
import {ENTITIES,validateOperation} from '../../backend/p2p/protocol.mjs';

export class Checkpoints extends SealedStore{
  constructor(directory,key,group){super(directory,key,'sst-backup:'+group);this.group=group;this.objects=new SealedStore(path.join(directory,'objects'),key,'sst-backup-objects:'+group);}
  async capture(device){
    const view=device.base.view.snapshot();await view.ready();
    try{
      if(view.version>device.base.view.core.signedLength||!await view.core.has(0,view.version))return {saved:false,reason:'awaiting-confirmation'};
      if(!await view.get('policy/owner'))return {saved:false,reason:'awaiting-group'};
      const objects=[];
      for await(const {key,value} of view.createReadStream({gte:'record/',lt:'record0'})){
        const row={key,...value},id=hex(crypto.hash(b4a.from(canonicalize(row))));objects.push(id);
        try{await this.objects.put(id,row,{exclusive:true});}catch(e){if(e.code!=='EEXIST')throw e;if(canonicalize(await this.objects.get(id))!==canonicalize(row))throw Error('Objeto de cópia inconsistente.');}
      }
      const version=hex(crypto.hash(b4a.from(canonicalize(objects))));
      try{const existing=await this.get(version);return {saved:true,id:version,createdAt:existing.createdAt,count:existing.objects.length};}catch(e){if(e.code!=='ENOENT')throw e;}
      const snapshot={group:this.group,version,createdAt:new Date().toISOString(),objects};
      await this.put(version,snapshot,{exclusive:true});return {saved:true,id:version,createdAt:snapshot.createdAt,count:objects.length};
    }finally{await view.close();}
  }
  close(){super.close();this.objects.close();}
  async list(){const result=[];for(const id of await this.ids()){const row=await this.get(id);result.push({id,createdAt:row.createdAt,count:row.objects.length});}return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  async preview(id,device){
    const saved=await this.get(id);if(saved.group!==device.baseKey)throw Error('Cópia pertence a outro SST.');
    const mutations=[];
    for(const object of saved.objects){
      const row=await this.objects.get(object);
      const [,entity,recordId]=row.key.split('/');
      if(!ENTITIES.includes(entity)||entity==='excecoes'||row.deleted)continue;
      const current=await device.get(entity,recordId);
      if(canonicalize(current?.value??null)===canonicalize(row.value))continue;
      mutations.push({kind:'put',entity,recordId,value:row.value,previous:current?.revision??null});
    }
    // Full restore is additive/updates only. Never delete a current record or restore an access exception.
    for(const mutation of mutations)validateOperation({...mutation,protocol:'sst-p2p-v2',id:'preview'});
    return {id,mutations,records:mutations.map(m=>({entity:m.entity,id:m.recordId})),deletesCurrentRecords:false,restoresAccessExceptions:false};
  }
}
