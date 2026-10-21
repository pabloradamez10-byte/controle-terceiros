const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<body><div id="v16-doc-section"></div>',{url:'https://sst.invalid',runScripts:'outside-only'}),w=dom.window;
 const dataUrl='data:application/pdf;base64,'+Buffer.from('%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF').toString('base64');
 const legacy={id:'legacy',donoTipo:'terceiro',donoId:'p',nome:'aso.pdf',mime:'application/pdf',tipo:'ASO',dataUrl,tamanho:45,validade:''};
 let saves=0,corrupt=false,uploaded;
 const reset=()=>w.localStorage.setItem('arquivosTerceirosV16',JSON.stringify({p:[legacy]}));reset();
 w.tssPode=()=>true;w.abrirAnalise=()=>{};w.toast=()=>{};w.getAll=()=>[{id:'p'}];w.registrarHistorico=()=>{};w.sstSafeDocumentURL=x=>x;
 w.tssSupabaseSyncNow=async()=>{saves++;return true};
 w.sstPrivateDocuments={upload:async(kind,id,file)=>{assert.equal(kind,'terceiro');assert.equal(id,'p');uploaded=await new Promise(resolve=>{const r=new w.FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(file)});return {storageId:'private-copy',storagePath:'private-copy/original',sha256:'a'.repeat(64),nome:file.name,mime:file.type,tamanho:file.size}},dataURL:async()=>corrupt?'data:application/pdf;base64,YmFk':dataUrl};
 w.eval(fs.readFileSync(__dirname+'/../documentos.js','utf8'));w.abrirAnalise('p');
 w.document.querySelector('[data-action="migrate"]').click();await new Promise(r=>setTimeout(r,60));
 assert.equal(uploaded,dataUrl,'copy preserves exact bytes');assert.equal(saves,1);
 let doc=JSON.parse(w.localStorage.getItem('arquivosTerceirosV16')).p[0];assert.equal(doc.id,'legacy','existing evidence links preserve document ID');assert.equal(doc.storageId,'private-copy');assert.equal(doc.dataUrl,undefined);
 reset();corrupt=true;w.abrirAnalise('p');w.document.querySelector('[data-action="migrate"]').click();await new Promise(r=>setTimeout(r,60));
 doc=JSON.parse(w.localStorage.getItem('arquivosTerceirosV16')).p[0];assert.equal(doc.dataUrl,dataUrl,'failed verification keeps original');assert.equal(saves,1);
 dom.window.close();console.log('Legacy document migration passed with simulated transport: original bytes verified before linking, document ID retained and failed copy preserves original.');
})().catch(e=>{console.error(e);process.exitCode=1});
