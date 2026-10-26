import c from 'compact-encoding';
import {SealedStore,hex} from './sealed-store.mjs';
import {validateOperation} from '../../backend/p2p/protocol.mjs';
import {verifyOperation} from '../../backend/p2p/signatures.mjs';

// Persist signed intent before append. Never persist a password or signing secret.
export class OperationJournal extends SealedStore{
  async prepare(operation){
    const ids=await this.ids();let pending=0;for(const id of ids){const row=await this.get(id);if(!['confirmed','conflict'].includes(row.state))pending++;}if(pending>=1000)throw Error('Há mil operações pendentes neste aparelho. Sincronize antes de continuar.');
    await this.put(operation.id,{operation,createdAt:new Date().toISOString(),state:'pending'},{exclusive:true});
  }
  async reconcile(device){
    const rows=[];
    for(const id of await this.ids()){
      const row=await this.get(id),op=validateOperation(row.operation);
      if(!verifyOperation(op,device.baseKey,device.writerKey))throw Error('Operação local não pertence ao aparelho.');
      let receipt=await device.receipt(id);
      if(!receipt.finalized&&receipt.accepted===null&&device.base.writable){
        // Recover a crash between append and journal update without duplicating a log entry.
        let present=false;
        for(let index=0;index<device.base.local.length;index++){
          const value=await device.base.local.get(index);
          if(value?.node?.value && c.decode(device.base.valueEncoding,value.node.value)?.id===id){present=true;break;}
        }
        if(!present&&['pending','submitted'].includes(row.state)){
          await device.base.append(op);row.state='submitted';await this.put(id,row);
        }
      }
      receipt=await device.receipt(id);
      if(receipt.finalized){const next=receipt.accepted?'confirmed':'conflict';if(row.state!==next){row.state=next;row.reason=receipt.reason;await this.put(id,row);}}
      rows.push({id,actor:op.actor,state:row.state,reason:row.reason??null,createdAt:row.createdAt,kind:op.kind,records:op.mutations?.map(m=>({entity:m.entity,id:m.recordId}))??[]});
    }
    return rows;
  }
  async submitted(id){const row=await this.get(id);row.state='submitted';await this.put(id,row);}
}
