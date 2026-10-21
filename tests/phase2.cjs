const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/..';
async function main(){
 const ctx=vm.createContext({performance:{now:()=>0},Date,Error,String});vm.runInContext(fs.readFileSync(root+'/access.js','utf8'),ctx);
 let now=0,version='v1',clean=true,changed=0,expires,packet={rule_version:'sst-access-v1',server_day:'2026-10-21',generated_at:'2026-10-21T20:00:00Z',state_version:'v1',statuses:{p:{status:'LIBERADO',ok:true,motivos:[],avisos:[]}}};
 const c=ctx.sstCreateAccessController({query:async()=>packet,version:()=>version,clean:()=>clean,onChange:()=>changed++,now:()=>now,timers:{setTimeout:(f,ms)=>{expires={f,ms};return 1},clearTimeout(){}}});
 assert.equal(c.get('p').ok,false);await c.refresh();assert.equal(c.get('p').ok,true);assert.equal(expires.ms,30000);
 const nativeNow=Date.now;Date.now=()=>9999999999999;assert.equal(c.get('p').ok,true);Date.now=nativeNow;
 clean=false;assert.equal(c.get('p').ok,false,'unsaved edits cannot inherit confirmation');clean=true;
 version='v2';assert.equal(c.get('p').ok,false,'state version mismatch must fail closed');version='v1';
 now=30001;assert.equal(c.get('p').ok,false,'monotonic expiry');expires.f();assert.ok(changed>1);
 now=0;packet={...packet,generated_at:'2026-10-22T02:59:58Z'};await c.refresh();assert.equal(expires.ms,2000,'confirmation expires at Brasília midnight');
 c.invalidate();assert.equal(c.get('p').ok,false);
 let release;const delayed=ctx.sstCreateAccessController({query:()=>new Promise(r=>release=r),version:()=>version,clean:()=>true,onChange(){},now:()=>now,timers:{setTimeout(){},clearTimeout(){}}});
 const waiting=delayed.refresh();delayed.invalidate();release(packet);await waiting;assert.equal(delayed.get('p').ok,false,'late response after logout/invalidation');
 const {validateFile}=await import('../supabase/functions/sst-documentos/validate.mjs');
 const pdf=new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
 assert.equal(validateFile(pdf,'aso.pdf','application/pdf').size,pdf.length);
 for(const [bytes,name,mime] of [[pdf,'x.png','image/png'],[pdf,'x.html','application/pdf'],[new Uint8Array(900001),'x.pdf','application/pdf'],[new TextEncoder().encode('%PDF-1.7 /OpenAction <<>> %%EOF'),'x.pdf','application/pdf'],[pdf,'../x.pdf','application/pdf']])assert.throws(()=>validateFile(bytes,name,mime));
 console.log('Phase 2 passed: monotonic expiry, midnight, local edits, mismatched versions, late responses, file size, magic bytes, extensions and active PDF rejection.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
