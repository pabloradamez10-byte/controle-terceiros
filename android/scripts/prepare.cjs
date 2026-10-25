const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),pack=require('bare-pack');
const root=path.resolve(__dirname,'../..'),android=path.join(root,'android');
(async()=>{
 const assets=process.env.SST_OCR_ASSETS;if(!assets)throw Error('SST_OCR_ASSETS obrigatório.');
 const out=path.join(android,'app/src/main/assets/ui');
 fs.rmSync(out,{recursive:true,force:true});
 require('../../scripts/p2p/build-ui.cjs').buildNativeUI({assets,out});
 fs.copyFileSync(path.join(android,'webview-bridge.js'),path.join(out,'native-bridge.js'));
 // Android serves its own packaged assets; the browser-host release manifest is not used here.
 fs.unlinkSync(path.join(out,'release.json'));
 const io=require(path.join(path.dirname(require.resolve('bare-pack')),'lib/fs.js'));
 const bundle=await pack(pathToFileURL(path.join(android,'app.cjs')),{base:pathToFileURL(root+'/'),resolve:require('bare-module-traverse').resolve.bare,imports:require('./imports.cjs')(),preset:'android'},io.readModule,io.listPrefix,io.resolveModule);
 fs.writeFileSync(path.join(android,'app/src/main/assets/core.bundle'),bundle.toBuffer());
 console.log('Android UI and real core bundled:',bundle.addons.length,'native addon targets.');
})();
