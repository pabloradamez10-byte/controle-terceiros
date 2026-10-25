require('bare-encoding/global');require('./encoding.cjs');
const {openAndroidCore}=require('./worklet.mjs');
const fs=require('bare-fs/promises'),crypto=require('hypercore-crypto'),b4a=require('b4a');
function check(ok,message){if(!ok)throw Error(message);}
(async()=>{
 const directory=Bare.argv[Bare.argv.length-1];let core=await openAndroidCore(directory);
 try{
  const password=b4a.toString(crypto.randomBytes(20),'hex');
  await core.service.execute({action:'initializeOwner',body:{email:'android-test@sst.local',password}});
  const ownerKey=core.session.identity.publicKey.toString('hex');
  await core.service.execute({action:'logout'});
  await core.service.execute({action:'login',body:{email:'ANDROID-TEST@sst.local',password}});
  check(core.session.identity.publicKey.toString('hex')===ownerKey,'Owner identity after logout');
  const current=(await core.service.execute({action:'state'}))[0];
  const state={...current.data,empresas:[{id:'e1',razao:'Teste Android'}],terceiros:[{id:'p1',nome:'Pessoa fictícia',empresaId:'e1'}]};
  await core.service.execute({action:'saveState',body:{p_data:state,p_expected:current.updated_at,p_reason:'Teste real do runtime Android'}});
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jbpQAAAAASUVORK5CYII=';
  const doc=await core.service.execute({action:'documents',body:{action:'upload',kind:'terceiro',ownerId:'p1',filename:'teste.png',mime:'image/png',base64:png}});
  check((await core.service.execute({action:'documents',body:{action:'view',id:doc.storageId}})).dataUrl.endsWith(png),'Document bytes');
  await core.service.execute({action:'users',body:{email:'portaria-test@sst.local',password,role:'portaria',ativo:true,permissoes:{consultar:true,cadastrar:false,liberar:false}}});
  await core.close();core=await openAndroidCore(directory);
  check((await core.service.execute({action:'status'})).locked,'Restart must lock');
  await core.service.execute({action:'login',body:{email:'android-test@sst.local',password}});
  check(core.session.identity.publicKey.toString('hex')===ownerKey,'Owner identity after restart');
  await core.service.execute({action:'logout'});
  await core.service.execute({action:'login',body:{email:'portaria-test@sst.local',password}});
  check((await core.service.execute({action:'state'}))[0].data.terceiros[0].id==='p1','Persisted person');
  let denied=false;try{await core.service.execute({action:'documents',body:{action:'download',id:doc.storageId}});}catch{denied=true;}check(denied,'Portaria download must fail');
  await core.service.execute({action:'logout'});check((await core.service.execute({action:'status'})).locked,'Logout');
  console.log('Bare real-core smoke passed: credentials, signed writes, document bytes, restart, login and Portaria denial.');
 }finally{await core.close();await fs.rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);Bare.exitCode=1;});
