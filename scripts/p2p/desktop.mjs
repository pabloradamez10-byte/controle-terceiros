import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import secureDirectory from './secure-desktop.cjs';
import {DeviceRuntime} from '../../src/platform/native/runtime.mjs';
import {createBrowserHost} from '../../src/platform/native/browser-host.mjs';
const directory=process.env.SST_DESKTOP_DATA||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'SST-Homologacao');
const uiDirectory=process.env.SST_DESKTOP_UI||path.resolve(import.meta.dirname,'../../desktop/ui');
let runtime,host,timer;
try{
 await secureDirectory(directory);runtime=await DeviceRuntime.open(directory);
 host=await createBrowserHost({service:runtime,uiDirectory});
 timer=setInterval(()=>runtime.maintenance(),15000);timer.unref();
 console.log('SST neste computador:',host.origin);
 if(process.env.SST_DESKTOP_OPEN!=='0'){
  const [command,args]=process.platform==='win32'?['cmd.exe',['/c','start','',host.origin]]:process.platform==='darwin'?['open',[host.origin]]:['xdg-open',[host.origin]];
  const child=spawn(command,args,{stdio:'ignore',detached:true});child.on('error',()=>{});child.unref();
 }
 await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
}catch{console.error('Não foi possível iniciar o SST. Confira o pacote de interface e as permissões da pasta de dados.');process.exitCode=1;}
finally{clearInterval(timer);await host?.close();await runtime?.close();}
