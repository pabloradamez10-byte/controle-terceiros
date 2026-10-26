const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),composition=require('./ui-sources.json');
function buildNativeUI({assets,out}){
 require('../../deploy/internal/build.cjs').build({origin:'https://sst-device.invalid',key:'sb_publishable_nativepackage',assets,out});
 const backend=composition.sources.map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n').replaceAll('horário do banco','horário informado pelo aparelho').replaceAll('Falha ao consultar Supabase','Falha ao consultar o núcleo local');
 new vm.Script(backend,{filename:'native-backend.js'});
 if(backend.includes('obzycbtfbadjwwwfpsed')||backend.includes('SUPABASE_ANON_KEY'))throw Error('Configuração remota no pacote P2P.');
 fs.writeFileSync(path.join(out,composition.target),backend);
 fs.copyFileSync(path.join(root,'src/platform/native/browser-bridge.js'),path.join(out,'native-bridge.js'));
 fs.copyFileSync(path.join(root,'assets/css/mobile.css'),path.join(out,'assets/css/mobile.css'));
 fs.copyFileSync(require.resolve('jsqr'),path.join(out,'jsqr.js'));
 fs.copyFileSync(path.join(path.dirname(require.resolve('jsqr')),'../LICENSE'),path.join(out,'jsqr-LICENSE'));
 let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
 html=html.replace('<script src="./assets/js/backend-sessao-usuarios.js">','<script src="./native-bridge.js"></script>\n<script src="./jsqr.js"></script>\n<script src="./assets/js/backend-sessao-usuarios.js">');
 fs.writeFileSync(path.join(out,'index.html'),html);
 // The host never caches a private response. A native package does not need a service worker.
 fs.writeFileSync(path.join(out,'service-worker.js'),"self.addEventListener('install',event=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));\n");
 const files=[];
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name!=='release.json')files.push({path:path.relative(out,file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});}}
 walk(out);const release=crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,16);
 const manifest={mode:'native-p2p-homologacao',release,files};
 fs.writeFileSync(path.join(out,'release.json'),JSON.stringify(manifest,null,2)+'\n');
 return manifest;
}
module.exports={buildNativeUI};
if(require.main===module){try{const result=buildNativeUI({assets:process.env.SST_OCR_ASSETS,out:process.env.SST_NATIVE_UI_OUT});console.log('Native UI prepared:',result.release,result.files.length,'files');}catch(error){console.error(error.message);process.exitCode=1;}}
