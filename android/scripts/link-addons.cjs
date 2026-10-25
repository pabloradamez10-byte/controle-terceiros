// Preserve upstream prebuilds and use patchelf for SONAME/NEEDED edits.
// LIEF's rewrite corrupts Android x64 dynsym entries: LIEF issue #1309.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),Bundle=require('bare-bundle');
const root=path.resolve(__dirname,'../..'),android=path.join(root,'android'),modules=new Map(),names=new Map();
for(const folder of [root,android])for(const entry of Object.keys(require(path.join(folder,'package-lock.json')).packages||{})){
 if(!entry.startsWith('node_modules/'))continue;
 const directory=path.join(folder,entry),file=path.join(directory,'package.json');if(!fs.existsSync(file))continue;
 const pkg=JSON.parse(fs.readFileSync(file));if(pkg.addon!==true)continue;
 const name=pkg.name.replaceAll('/','__').replace(/^@/,''),lib='lib'+name+'.'+pkg.version+'.so';
 modules.set(lib,{directory,name});names.set(name+'@'+pkg.version.split('.')[0]+'.bare',lib);
}
const bundle=Bundle.from(fs.readFileSync(path.join(android,'app/src/main/assets/core.bundle')));
const output=path.join(android,'app/src/main/addons');fs.rmSync(output,{recursive:true,force:true});
function run(command,args){const result=spawnSync(command,args,{encoding:'utf8',maxBuffer:8*1024*1024});if(result.status!==0)throw Error(command+' failed: '+(result.stderr||result.error));return result.stdout;}
for(const [abi,host]of [['arm64-v8a','android-arm64'],['x86_64','android-x64']]){
 const folder=path.join(output,abi);fs.mkdirSync(folder,{recursive:true});
 for(const addon of bundle.addons){
  const lib=addon.replace(/^linked:/,''),module=modules.get(lib);if(!module||lib!==path.basename(lib))throw Error('Unknown addon: '+addon);
  const original=path.join(module.directory,'prebuilds',host,module.name+'.bare'),target=path.join(folder,lib);
  fs.copyFileSync(original,target);
  const needed=run(process.env.PATCHELF||'patchelf',['--print-needed',original]).trim().split('\n').filter(Boolean);
  const args=['--page-size','16384','--set-soname',lib,'--set-rpath','$ORIGIN','--add-needed','libbare-kit.so'];
  for(const item of needed)if(names.has(item))args.push('--replace-needed',item,names.get(item));
  run(process.env.PATCHELF||'patchelf',[...args,target]);
  const symbols=spawnSync('readelf',['--dyn-syms','--wide',target],{encoding:'utf8',maxBuffer:8*1024*1024});
  if(symbols.status!==0||symbols.stderr)throw Error('Invalid ELF symbols: '+lib+' '+symbols.stderr);
 }
}
console.log('Android libraries linked with patchelf; valid ELF symbol tables for both ABIs.');
