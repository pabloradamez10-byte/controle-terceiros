const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function build({origin,key,assets,out}){
 const u=new URL(origin);
 if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password)throw Error('SST_PUBLIC_ORIGIN deve ser uma origem HTTPS, sem caminho.');
 let role;
 try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role;}catch{}
 if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key||'')&&role!=='anon')throw Error('Use somente chave pública anon/publishable. Chave privilegiada recusada.');
 const lock=JSON.parse(fs.readFileSync(path.join(__dirname,'assets-lock.json')));
 for(const f of lock.files){
  const bytes=fs.readFileSync(path.join(assets,f.path));
  if(bytes.length!==f.size||crypto.createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Dependência divergente: '+f.path);
 }
 if(fs.existsSync(out))throw Error('Diretório de saída já existe; gere uma nova versão em outro diretório.');
 fs.mkdirSync(out,{recursive:true});
 const assembled=require('../../scripts/sources.json').groups.map(g=>g.target);
 const publicFiles=[...new Set(['index.html',...assembled,'service-worker.js','manifest.json','icon-192.png','icon-512.png','vendor/purify-3.4.17.min.js','vendor/xlsx-0.20.3.full.min.js','vendor/DOMPurify-LICENSE','vendor/SheetJS-LICENSE'])];
 for(const name of publicFiles){fs.mkdirSync(path.dirname(path.join(out,name)),{recursive:true});fs.copyFileSync(path.join(root,name),path.join(out,name));}
 for(const f of lock.files){const target=path.join(out,'vendor/ocr',f.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(assets,f.path),target);}
 let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
 const backendFile=path.join(out,'assets/js/backend-sessao-usuarios.js');
 let backend=fs.readFileSync(backendFile,'utf8');
 backend=backend.replace(/const SUPABASE_URL = '[^']+';/,"const SUPABASE_URL = location.origin + '/backend';").replace(/const SUPABASE_ANON_KEY = '[^']+';/,'const SUPABASE_ANON_KEY = '+JSON.stringify(key)+';');
 if(backend.includes('obzycbtfbadjwwwfpsed')||!backend.includes("location.origin + '/backend'"))throw Error('Não foi possível isolar a configuração do backend.');
 fs.writeFileSync(backendFile,backend);
 const cssFile=path.join(out,'assets/css/base.css');
 fs.writeFileSync(cssFile,fs.readFileSync(cssFile,'utf8').replace(/\s*@import url\('https:\/\/fonts.googleapis.com[^']+'\);/,''));
 const hashes=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(m=>m[1].trim()).map(m=>"'sha256-"+crypto.createHash('sha256').update(m[1]).digest('base64')+"'");
 const csp="default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob: "+hashes.join(' ')+"; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
 html=html.replace(/http-equiv="Content-Security-Policy" content="[^"]+"/,'http-equiv="Content-Security-Policy" content="'+csp.replace("; frame-ancestors 'none'",'')+'"');
 if(html.includes('obzycbtfbadjwwwfpsed'))throw Error('Configuração externa residual.');
 fs.writeFileSync(path.join(out,'index.html'),html);
 let docs=fs.readFileSync(path.join(out,'documentos.js'),'utf8').replace('https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js','./vendor/ocr/tesseract.min.js').replace('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs','./vendor/ocr/pdf.min.mjs').replace("'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'","new URL('./vendor/ocr/pdf.worker.min.mjs',location.href).href");
 docs=docs.replace("createWorker('por',1,{logger:","createWorker('por',1,{workerPath:new URL('./vendor/ocr/worker.min.js',location.href).href,corePath:new URL('./vendor/ocr/core/',location.href).href,langPath:new URL('./vendor/ocr/lang/',location.href).href,logger:");
 if(docs.includes('https://'))throw Error('Dependência externa residual na leitura.');
 fs.writeFileSync(path.join(out,'documentos.js'),docs);
 // Every release has a unique public-shell cache, including the configured origin/key.
 const release=crypto.createHash('sha256').update(html+docs+publicFiles.filter(f=>f!=='index.html'&&f!=='documentos.js').map(f=>fs.readFileSync(path.join(out,f))).join('')).digest('hex').slice(0,16);
 for(const name of ['security.js','service-worker.js']){
  let text=fs.readFileSync(path.join(out,name),'utf8').replaceAll('portal-terceiros-sst-organization-20261021-1','portal-terceiros-sst-internal-'+release).replaceAll('portal-terceiros-sst-nativeui-20261024-2','portal-terceiros-sst-internal-'+release);
  fs.writeFileSync(path.join(out,name),text);
 }
 fs.writeFileSync(path.join(out,'csp.nginx.conf'),'add_header Content-Security-Policy "'+csp+'" always;\n');
 const manifest={origin,release,files:[]};
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else manifest.files.push({path:path.relative(out,p),sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')});}}
 walk(out);fs.writeFileSync(path.join(out,'release.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
module.exports={build};
if(require.main===module){try{const result=build({origin:process.env.SST_PUBLIC_ORIGIN,key:process.env.SST_ANON_KEY,assets:process.env.SST_OCR_ASSETS,out:process.argv[2]});console.log('Pacote interno gerado: '+result.release);}catch(e){console.error(e.message);process.exitCode=1;}}
