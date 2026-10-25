import { SstDevice } from '../src/backend/p2p/device.mjs';
import { SstSession } from '../src/backend/p2p/session.mjs';
import { IdentityVault } from '../src/platform/native/identity-vault.mjs';
import { openDeviceConfig } from '../src/platform/native/device-files.mjs';
import { NativeFrontendService } from '../src/platform/native/frontend-service.mjs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import b4a from 'b4a';

export async function openAndroidCore(directory) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const settings=await openDeviceConfig(directory);
  const device=await SstDevice.open({...settings.config,directory:settings.directory});
  const session=new SstSession(device,new IdentityVault(path.join(directory,'identities')));
  return {device,session,service:new NativeFrontendService(device,session),async close(){session.logout();await device.close();}};
}

if(Bare.IPC){
  (async()=>{
    const core=await openAndroidCore(Bare.argv[Bare.argv.length-1]);
    let buffer=b4a.alloc(0),queue=Promise.resolve();
    Bare.IPC.on('data',chunk=>{
      buffer=b4a.concat([buffer,chunk]);
      if(buffer.length>1500000){core.session.logout();Bare.exit(1);return;}
      let newline;
      while((newline=buffer.indexOf(10))!==-1){
        const line=b4a.toString(buffer.subarray(0,newline));buffer=buffer.subarray(newline+1);
        queue=queue.then(async()=>{
          let request;
          try{
            request=JSON.parse(line);
            const data=await core.service.execute(request);
            Bare.IPC.write(JSON.stringify({id:request.id,ok:true,data})+'\n');
          }catch(error){Bare.IPC.write(JSON.stringify({id:request?.id??null,ok:false,error:error.message})+'\n');}
        });
      }
    });
    Bare.IPC.on('end',()=>{core.close().finally(()=>Bare.exit());});
    Bare.IPC.write(JSON.stringify({event:'ready'})+'\n');
  })().catch(()=>{Bare.IPC.write(JSON.stringify({event:'fatal',error:'Não foi possível abrir o núcleo local.'})+'\n');});
}
