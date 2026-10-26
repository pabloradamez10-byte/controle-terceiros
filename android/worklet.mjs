import {DeviceRuntime} from '../src/platform/native/runtime.mjs';
import b4a from 'b4a';

export async function openAndroidCore(directory){
  const runtime=await DeviceRuntime.open(directory);
  return {get device(){return runtime.device;},get session(){return runtime.session;},service:runtime,close:()=>runtime.close()};
}

if(Bare.IPC){
  (async()=>{
    const core=await openAndroidCore(Bare.argv[Bare.argv.length-1]);
    let buffer=b4a.alloc(0),queue=Promise.resolve();
    const maintenance=setInterval(()=>core.service.maintenance(),15000);maintenance.unref?.();
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
    Bare.IPC.on('end',()=>{clearInterval(maintenance);core.close().finally(()=>Bare.exit());});
    Bare.IPC.write(JSON.stringify({event:'ready'})+'\n');
  })().catch(()=>{Bare.IPC.write(JSON.stringify({event:'fatal',error:'Não foi possível abrir o núcleo local.'})+'\n');});
}
