const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{build}=require('../deploy/internal/build.cjs'),{prepare}=require('../deploy/internal/prepare-functions.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sst-internal-test-'));
try{
 const lockFile=path.join(__dirname,'../deploy/internal/assets-lock.json'),lock=JSON.parse(fs.readFileSync(lockFile)),assets=process.env.SST_TEST_OCR_ASSETS;
 // Integrity can be tested with real pinned assets on preparation hosts. In CI,
 // refuse a missing/tampered asset without downloading from third-party networks.
 const options={origin:'https://sst.interno.example',key:'sb_publishable_fixture',assets:assets||path.join(temp,'missing'),out:path.join(temp,'release')};
 assert.throws(()=>build({...options,key:'sb_secret_forbidden'}),/pública/);
 const badJWT='x.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.x';assert.throws(()=>build({...options,key:badJWT}),/pública/);
 assert.throws(()=>build({...options,origin:'http://sst.interno.example'}),/HTTPS/);
 if(assets){
  const result=build(options),html=fs.readFileSync(path.join(options.out,'index.html'),'utf8'),docs=fs.readFileSync(path.join(options.out,'documentos.js'),'utf8');
  assert.ok(result.files.length>20);assert.ok(!html.includes('obzycbtfbadjwwwfpsed'));assert.ok(!html.includes('fonts.googleapis.com'));assert.ok(fs.readFileSync(path.join(options.out,'assets/js/backend-sessao-usuarios.js'),'utf8').includes("location.origin + '/backend'"));
  assert.ok(!docs.includes('https://'));assert.ok(docs.includes('corePath:new URL'));assert.ok(docs.includes('langPath:new URL'));assert.ok(docs.includes('workerPath:new URL'));
  for(const s of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(s[1].trim())assert.ok(html.includes("'sha256-"+crypto.createHash('sha256').update(s[1]).digest('base64')+"'"));
  assert.ok(!fs.existsSync(path.join(options.out,'supabase')));assert.ok(!fs.existsSync(path.join(options.out,'.env')));
  assert.throws(()=>build(options),/já existe/);
  for(const f of lock.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(options.out,'vendor/ocr',f.path))).digest('hex'),f.sha256);
 }else assert.throws(()=>build(options),/ENOENT/);
 const fn=path.join(temp,'functions');prepare(options.origin,fn);
 const user=fs.readFileSync(path.join(fn,'sst-usuarios/index.ts'),'utf8');assert.ok(user.includes(options.origin));assert.ok(!user.includes('/controle-terceiros/'));assert.ok(!user.includes('github.io'));
 assert.throws(()=>prepare('http://bad.example',path.join(temp,'bad')),/HTTPS/);
 const badAssets=path.join(temp,'tampered');fs.mkdirSync(badAssets);fs.writeFileSync(path.join(badAssets,lock.files[0].path),'tampered');assert.throws(()=>build({...options,assets:badAssets,out:path.join(temp,'bad-release')}),/divergente/);
 const guarded=require('node:child_process').spawnSync('bash',[path.join(__dirname,'../deploy/internal/backup.sh')],{encoding:'utf8',env:{...process.env,SST_STACK_DIR:'/no-server',SST_RELEASE_DIR:'/no-release',SST_BACKUP_DIR:'/no-backup',SST_BACKUP_RECIPIENT:'public-placeholder',SST_WRITES_FROZEN:''}});
 assert.equal(guarded.status,1);assert.ok(guarded.stderr.includes('Suspenda as escritas'));
 const backup=fs.readFileSync(path.join(__dirname,'../deploy/internal/backup.sh'),'utf8');assert.ok(backup.includes('SST_WRITES_FROZEN'));assert.ok(backup.includes('age -r'));assert.ok(backup.includes('pg_dumpall'));assert.ok(!backup.includes('down -v'));
 console.log('Internal preparation passed: public-key restriction, HTTPS, asset integrity gates, isolated function configuration'+(assets?', full offline frontend build and 18 verified OCR assets.':' (full build requires pinned assets).'));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
