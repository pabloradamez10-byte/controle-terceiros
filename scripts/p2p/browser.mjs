import path from 'node:path';
import { SstDevice } from '../../src/backend/p2p/device.mjs';
import { SstSession } from '../../src/backend/p2p/session.mjs';
import { IdentityVault } from '../../src/platform/native/identity-vault.mjs';
import { openDeviceConfig } from '../../src/platform/native/device-files.mjs';
import { NativeFrontendService } from '../../src/platform/native/frontend-service.mjs';
import { createBrowserHost } from '../../src/platform/native/browser-host.mjs';
const [directory,uiDirectory]=process.argv.slice(2);
if(!directory||!uiDirectory){console.error('Uso: npm run p2p:browser -- DIRETORIO_APARELHO PACOTE_INTERFACE');process.exit(1);}
let device,session,host;
try{
  const settings=await openDeviceConfig(directory);
  device=await SstDevice.open({...settings.config,directory:settings.directory});
  session=new SstSession(device,new IdentityVault(path.resolve(directory,'identities')));
  host=await createBrowserHost({service:new NativeFrontendService(device,session),uiDirectory,port:Number(process.env.SST_NATIVE_PORT||0)});
  console.log('Homologação local do SST:',host.origin);
  let finish;const stopped=new Promise(resolve=>finish=resolve);
  process.once('SIGINT',finish);process.once('SIGTERM',finish);await stopped;
}catch(error){console.error('Falha ao iniciar a homologação:',error.code??'configuration-error');process.exitCode=1;}
finally{session?.logout();await host?.close();await device?.close();}
