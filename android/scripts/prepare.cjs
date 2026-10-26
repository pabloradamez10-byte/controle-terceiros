const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),pack=require('bare-pack');
const root=path.resolve(__dirname,'../..'),android=path.join(root,'android');
(async()=>{
 const assets=process.env.SST_OCR_ASSETS;if(!assets)throw Error('SST_OCR_ASSETS obrigatório.');
 const out=path.join(android,'app/src/main/assets/ui');
 fs.rmSync(out,{recursive:true,force:true});
 require('../../scripts/p2p/build-ui.cjs').buildNativeUI({assets,out});
 fs.copyFileSync(path.join(android,'webview-bridge.js'),path.join(out,'native-bridge.js'));
 const index=path.join(out,'index.html');
 fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('<title>Portal Terceiros SST</title>','<title>SST Homologação 0.2.2</title>').replace('SST Manager</h2>','SST Homologação 0.2.2</h2>').replace('Acesso restrito ao controle de terceiros.','Revisão 0.2.2. Correção de armazenamento privado no Android. Teste local com dados fictícios.'));
 fs.unlinkSync(path.join(out,'release.json'));
 const notices=path.join(out,'notices');fs.mkdirSync(notices,{recursive:true});
 for(const file of ['LICENSE-APACHE-2.0','NOTICE','THIRD_PARTY.md'])fs.copyFileSync(path.join(android,file),path.join(notices,file));
 for(const [prefix,folder]of [['core',root],['android',android]]){
  const lock=require(path.join(folder,'package-lock.json'));
  for(const name of Object.keys(lock.packages||{})){
   if(!name.startsWith('node_modules/'))continue;
   const directory=path.join(folder,name);if(!fs.existsSync(directory))continue;
   for(const file of fs.readdirSync(directory).filter(file=>/^(licen[cs]e|notice|copying)(\.|$)/i.test(file))){
    const source=path.join(directory,file);if(fs.statSync(source).isFile())fs.copyFileSync(source,path.join(notices,prefix+'-'+name.replaceAll('/','_')+'-'+file));
   }
  }
 }
 const io=require(path.join(path.dirname(require.resolve('bare-pack')),'lib/fs.js'));
 const bundle=await pack(pathToFileURL(path.join(android,'app.cjs')),{base:pathToFileURL(root+'/'),resolve:require('bare-module-traverse').resolve.bare,imports:require('./imports.cjs')(),preset:'android'},io.readModule,io.listPrefix,io.resolveModule);
 fs.writeFileSync(path.join(android,'app/src/main/assets/core.bundle'),bundle.toBuffer());
 console.log('Android UI and real core bundled:',bundle.addons.length,'native addon targets.');
})();
