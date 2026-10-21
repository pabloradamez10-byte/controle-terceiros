const fs=require('node:fs'),path=require('node:path');
function prepare(origin,out){
 const u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin)throw Error('Use origem HTTPS, sem caminho.');
 if(fs.existsSync(out))throw Error('Destino já existe.');
 const root=path.resolve(__dirname,'../..');
 for(const name of ['sst-usuarios','sst-documentos']){
  const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});
  let source=fs.readFileSync(path.join(root,'supabase/functions',name,'index.ts'),'utf8');
  source=source.replace(/const origin = '[^']+'/, 'const origin = '+JSON.stringify(origin));
  source=source.replace("origin + '/controle-terceiros/'", "origin + '/'");
  if(source.includes('pabloradamez10-byte.github.io'))throw Error('Origem externa residual');
  fs.writeFileSync(path.join(dir,'index.ts'),source);
  if(name==='sst-documentos')fs.copyFileSync(path.join(root,'supabase/functions',name,'validate.mjs'),path.join(dir,'validate.mjs'));
 }
}
module.exports={prepare};
if(require.main===module){try{prepare(process.env.SST_PUBLIC_ORIGIN,process.argv[2]);console.log('Funções preparadas; publicar apenas na instância interna.');}catch(e){console.error(e.message);process.exitCode=1;}}
