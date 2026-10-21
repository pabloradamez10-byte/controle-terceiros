  window.sstPrivateDocuments = {
    async request(body){
      const res=await authorizedFetch(SUPABASE_URL+'/functions/v1/sst-documentos',{method:'POST',body:JSON.stringify(body)});
      const result=await res.json();if(!res.ok)throw new Error(result.error||'Operação documental não confirmada.');return result;
    },
    async upload(kind,ownerId,file){
      const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Falha na leitura do arquivo.'));r.readAsDataURL(file);});
      return this.request({action:'upload',kind,ownerId,filename:file.name,mime:file.type||(/\.pdf$/i.test(file.name)?'application/pdf':/\.png$/i.test(file.name)?'image/png':/\.webp$/i.test(file.name)?'image/webp':'image/jpeg'),base64:String(dataUrl).split(',')[1]});
    },
    async dataURL(item){
      if(item.storageId)return (await this.request({action:'download',id:item.storageId})).dataUrl;
      return window.sstSafeDocumentURL(item.dataUrl);
    }
  };
  let checkedRevision=-1, checkedBaseline=null, checkedClean=false;
  const accessController=window.sstCreateAccessController({
    version:()=>auditStamp,
    clean:()=>{
      if(checkedRevision!==window.sstPrivateRevision || checkedBaseline!==auditBaseline){
        checkedRevision=window.sstPrivateRevision;checkedBaseline=auditBaseline;
        checkedClean=!!auditBaseline && businessState(readLocalState())===businessState(auditBaseline);
      }
      return !!session && can('consultar') && checkedClean;
    },
    query:async()=>{
      const res=await authorizedFetch(SUPABASE_URL+'/rest/v1/rpc/sst_access_now',{method:'POST',body:'{}'});
      if(!res.ok)throw new Error('Consulta não confirmada.');return res.json();
    },
    onChange:()=>{
      if(!bootFinished)return;
      renderEverythingSafe();
      let banner=document.getElementById('sst-access-confirmation');
      if(!banner){banner=document.createElement('p');banner.id='sst-access-confirmation';banner.setAttribute('role','status');document.querySelector('main')?.prepend(banner);}
      const check=accessController.get((typeof getAll==='function'?getAll():[])[0]?.id);
      banner.textContent=check.confirmado?'Situações confirmadas pelo servidor em '+new Date(check.confirmadoEm).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' (Brasília). Atualização automática a cada 20 segundos.':'Situações de acesso sem confirmação atual do servidor. Não autorize entrada com esta consulta.';
      banner.style.cssText='padding:10px 14px;border-radius:8px;background:'+(check.confirmado?'#eff6ff':'#fef2f2')+';color:#172033';
      if(window.sstSelectedPersonId && document.getElementById('v24-result')?.classList.contains('show'))(window.v242AbrirExpress||window.v24AbrirExpress)?.(window.sstSelectedPersonId);
      else if(document.getElementById('v24-busca')?.value)window.v24ConsultarExpress?.();
    }
  });
  window.getStatus=function(t){return accessController.get(t.id);};
  window.addEventListener('offline',()=>accessController.invalidate());
  document.addEventListener('visibilitychange',()=>{accessController.invalidate();});
  setInterval(()=>{if(bootFinished && session && !document.hidden)window.tssSupabaseReload().catch(()=>{});},20000);
