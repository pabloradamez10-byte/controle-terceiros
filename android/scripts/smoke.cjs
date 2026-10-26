const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url'),{spawnSync}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'sst-bare-smoke-'));
 try{
  const pack=require('bare-pack'),io=require(path.join(path.dirname(require.resolve('bare-pack')),'lib/fs.js'));
  const bundle=await pack(pathToFileURL(path.join(root,'android/smoke.cjs')),{base:pathToFileURL(root+'/'),resolve:require('bare-module-traverse').resolve.bare,imports:require('./imports.cjs')(),offload:{addons:true}},io.readModule,io.listPrefix,io.resolveModule,(url,bytes)=>{
   const name=crypto.createHash('sha256').update(url.href).digest('hex')+'.bare';fs.mkdirSync(path.join(out,'addons'),{recursive:true});fs.writeFileSync(path.join(out,'addons',name),bytes);return '/../addons/'+name;
  });
  const file=path.join(out,'smoke.bundle');fs.writeFileSync(file,bundle.toBuffer());
  const result=spawnSync(path.join(root,'android/node_modules/.bin/bare'),[file,path.join(out,'device')],{stdio:'inherit',timeout:60000});
  if(result.status!==0)throw Error('Bare smoke failed: '+result.status);
 }finally{fs.rmSync(out,{recursive:true,force:true});}
})();
