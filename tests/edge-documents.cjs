// Execute the actual Edge handler with simulated Auth/Storage transports.
// This does not claim a live authenticated browser upload.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
(async()=>{
 const {validateFile}=await import('../supabase/functions/sst-documentos/validate.mjs');
 let handler,role='cadastro',active=true,token=true,record=null,stored=null,storageCalls=0;
 const source=stripTypeScriptTypes(fs.readFileSync(__dirname+'/../supabase/functions/sst-documentos/index.ts','utf8').replace(/^import .*\n/,''));
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 const fakeFetch=async(url,opts={})=>{
  if(url.endsWith('/auth/v1/user'))return reply({id:'11111111-1111-1111-1111-111111111111'},token?200:401);
  if(url.includes('/sst_members?'))return reply([{email:'fixture@example.invalid',role,ativo:active,permissoes:{cadastrar:role==='cadastro',consultar:true}}]);
  if(url.includes('/app_data?'))return reply([{data:{terceiros:[{id:'p'}],empresas:[]}}]);
  if(url.includes('/sst_document_files?'))return reply(record?[record]:[]);
  if(url.endsWith('/sst_document_files')){record=JSON.parse(opts.body);return reply([{...record,created_at:'2026-10-21T12:00:00Z'}]);}
  if(url.includes('/storage/v1/object/authenticated/'))return new Response(stored);
  if(url.includes('/storage/v1/object/')){storageCalls++;stored=opts.body;assert.equal(opts.headers['x-upsert'],'false');return reply({});}
  throw Error('Unexpected backend route');
 };
 vm.runInNewContext(source,{Deno:{env:{get:key=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-only',SUPABASE_ANON_KEY:'public'})[key]},serve:f=>handler=f},fetch:fakeFetch,Response,Request,Uint8Array,TextDecoder,crypto,atob,btoa,JSON,Error,Number,encodeURIComponent,validateFile});
 const call=body=>handler(new Request('https://fixture.invalid/functions/v1/sst-documentos',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify(body)}));
 const pdf=Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
 const upload={action:'upload',kind:'terceiro',ownerId:'p',filename:'aso.pdf',mime:'application/pdf',base64:pdf.toString('base64')};
 token=false;assert.equal((await call(upload)).status,401);token=true;
 role='portaria';assert.equal((await call(upload)).status,403);role='cadastro';
 active=false;assert.equal((await call(upload)).status,403);active=true;
 assert.equal((await call({...upload,ownerId:'other'})).status,400);
 assert.equal((await call({...upload,mime:'image/png'})).status,400);assert.equal(storageCalls,0);
 const sent=await call(upload);assert.equal(sent.status,200);const descriptor=await sent.json();assert.equal(descriptor.dataUrl,undefined);assert.equal(descriptor.sha256.length,64);assert.equal(record.created_by,'11111111-1111-1111-1111-111111111111');assert.equal(storageCalls,1);
 const downloaded=await call({action:'download',id:descriptor.storageId});assert.equal(downloaded.status,200);assert.equal((await downloaded.json()).dataUrl,'data:application/pdf;base64,'+pdf.toString('base64'));
 stored=new Uint8Array([1,2,3]);assert.equal((await call({action:'download',id:descriptor.storageId})).status,500,'corrupt bytes must not be returned');
 role='portaria';assert.equal((await call({action:'download',id:descriptor.storageId})).status,403);
 assert.equal(sent.headers.get('cache-control'),'no-store');
 console.log('Edge handler passed with simulated transports: missing/revoked identity, portaria denial, owner checks, byte validation, private immutable upload, verified download and corruption refusal.');
})().catch(e=>{console.error(e);process.exitCode=1});
