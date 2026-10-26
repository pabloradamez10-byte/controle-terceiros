import path from 'node:path';
import { DeviceRuntime } from '../../src/platform/native/runtime.mjs';
import { createBrowserHost } from '../../src/platform/native/browser-host.mjs';
const [directory,uiDirectory]=process.argv.slice(2);
if(!directory||!uiDirectory){console.error('Uso: npm run p2p:browser -- DIRETORIO_APARELHO PACOTE_INTERFACE');process.exit(1);}
let runtime,host,timer;
try{
  runtime=await DeviceRuntime.open(directory);
  timer=setInterval(()=>runtime.maintenance(),15000);timer.unref();
  host=await createBrowserHost({service:runtime,uiDirectory,port:Number(process.env.SST_NATIVE_PORT||0)});
  console.log('Homologação local do SST:',host.origin);
  let finish;const stopped=new Promise(resolve=>finish=resolve);
  process.once('SIGINT',finish);process.once('SIGTERM',finish);await stopped;
}catch(error){console.error('Falha ao iniciar a homologação:',error.code??'configuration-error');process.exitCode=1;}
finally{clearInterval(timer);await host?.close();await runtime?.close();}
