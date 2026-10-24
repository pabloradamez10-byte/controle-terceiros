(function(){
  if(!window.sstNativeMode)return;
  let pdfModule;
  window.v26VisualizarDataUrl=function(dataUrl,mime,name){
    const generation=window.sstPrivateRevision;
    dataUrl=window.sstSafeDocumentURL(dataUrl);
    const overlay=document.createElement('div');overlay.className='v26-doc-preview-overlay sst-sensitive-dialog';
    const panel=document.createElement('section');panel.className='v26-doc-preview';
    const head=document.createElement('div');head.className='v26-doc-preview-head';
    const title=document.createElement('strong');title.textContent=name||'Documento';
    const close=document.createElement('button');close.type='button';close.textContent='Fechar';close.onclick=()=>overlay.remove();
    head.append(title,close);
    const body=document.createElement('div');body.className='v26-doc-preview-body';body.setAttribute('role','status');
    body.oncontextmenu=event=>event.preventDefault();panel.append(head,body);overlay.append(panel);document.body.append(overlay);
    if(String(mime).startsWith('image/')){const img=document.createElement('img');img.src=dataUrl;img.alt=name||'Documento';img.draggable=false;body.append(img);return;}
    if(mime!=='application/pdf'){body.textContent='Este formato não tem visualização disponível no aplicativo.';return;}
    body.textContent='Carregando documento...';
    (async()=>{
      pdfModule??=await import(new URL('./vendor/ocr/pdf.min.mjs',location.href).href);
      pdfModule.GlobalWorkerOptions.workerSrc=new URL('./vendor/ocr/pdf.worker.min.mjs',location.href).href;
      const bytes=Uint8Array.from(atob(dataUrl.split(',')[1]),char=>char.charCodeAt(0));
      const pdf=await pdfModule.getDocument({data:bytes,isEvalSupported:false}).promise;
      try{
        if(!overlay.isConnected||generation!==window.sstPrivateRevision)return;
        if(pdf.numPages>100)throw Error('Documento excede o limite de visualização.');
        let totalPixels=0;body.replaceChildren();
        for(let number=1;number<=pdf.numPages;number++){
          if(!overlay.isConnected||generation!==window.sstPrivateRevision)return;
          const page=await pdf.getPage(number),original=page.getViewport({scale:1});
          const scale=Math.min(1.2,2048/Math.max(original.width,original.height));
          const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');
          totalPixels+=Math.ceil(viewport.width)*Math.ceil(viewport.height);
          if(!Number.isFinite(totalPixels)||viewport.width<=0||viewport.height<=0||totalPixels>24000000)throw Error('Documento excede o limite de visualização.');
          canvas.width=viewport.width;canvas.height=viewport.height;canvas.style.maxWidth='100%';canvas.setAttribute('aria-label','Página '+number);
          body.append(canvas);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
        }
      }finally{await pdf.destroy();}
    })().catch(()=>{if(overlay.isConnected)body.textContent='Não foi possível visualizar este PDF. O aplicativo não disponibilizou um download alternativo.';});
  };
})();
