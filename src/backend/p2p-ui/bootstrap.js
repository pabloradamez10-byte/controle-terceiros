  async function initNative(){
    if(nativeScrubbed){location.reload();return;}
    if(!window.sstSecurityReady){lockApp('Não foi possível carregar a proteção.');return;}
    wrapLocalSavers();
    try{
      if(!await ensureSession()){lockApp();return;}
      await loadMembership();installPermissionGuards();installNativeGuards();
      const remote=await fetchRemoteState();
      if(!remote?.data)throw Error('Base local não disponível.');
      auditStamp=remote.updated_at;auditBaseline=remote.data;applyRemoteState(remote.data);
      await window.tssExceptionStore.reload();
      localStorage.removeItem('liberacoesExcecao');renderEverythingSafe();bootFinished=true;unlockApp();
      let banner=document.getElementById('sst-native-status');
      if(!banner){banner=document.createElement('p');banner.id='sst-native-status';banner.setAttribute('role','status');document.querySelector('main').prepend(banner);}
      banner.textContent='Homologação P2P · dados neste aparelho. As situações de entrada ainda não têm confirmação temporal independente.';
      updateBancoBadge('online');
    }catch(error){await nativeCall('logout').catch(()=>{});endNativeSession();authError(error.message);}
  }
  window.tssSair=async function(){
    if(loggingOut)return;loggingOut=true;bootFinished=false;endNativeSession();
    try{await nativeCall('logout');await window.sstPurgePrivateCaches();}finally{location.reload();}
  };
  window.tssSupabaseSyncNow=async function(){
    try{await saveRemoteState();updateBancoBadge('online');return true;}
    catch(error){updateBancoBadge('offline');alert(error.message);return false;}
  };
  window.tssSupabaseReload=async function(){
    if(auditSaving||(auditBaseline&&businessState(readLocalState())!==businessState(auditBaseline)))return false;
    const generation=sessionGeneration;
    try{
      const remote=await fetchRemoteState();
      if(generation!==sessionGeneration||!session)return false;
      auditStamp=remote.updated_at;auditBaseline=remote.data;applyRemoteState(remote.data);
      await window.tssExceptionStore.reload();renderEverythingSafe();return true;
    }catch(error){updateBancoBadge('offline');return false;}
  };
  let nativeGuardsInstalled=false,nativeObserver=null;
  function installNativeGuards(){
    if(nativeGuardsInstalled)return;nativeGuardsInstalled=true;
    for(const name of ['abrirEdicao','removerAnexoTerceiro','removerArquivoEmpresaV26','removerArquivoTerceiroV16']){
      const original=window[name];if(typeof original==='function')window[name]=function(){if(!can('cadastrar'))return toast('Seu perfil permite apenas consulta.');return original.apply(this,arguments);};
    }
    for(const name of ['abrirExportacaoRelatorio','gerarRelatorioExecutivo','baixarArquivoTerceiroV26','baixarArquivoTerceiroV16','baixarArquivoEmpresaV26','v26BaixarTemp','exportarBackupJSON','exportarCSVEmpresas','exportarCSVTerceiros','baixarModeloCSV']){
      const original=window[name];if(typeof original==='function')window[name]=function(){if(!window.sstCanDownloadDocuments())return toast('Seu perfil permite visualizar, sem baixar ou exportar.');return original.apply(this,arguments);};
    }
    const hideBlocked=()=>{
      if(!document?.body)return;
      for(const button of document.querySelectorAll('button[data-sst-click],button[data-action]')){
        const action=button.getAttribute('data-sst-click')||'', direct=button.dataset.action;
        if(!can('cadastrar')&&(/"name":"(?:abrirEdicao|excluir|remover|salvar)/.test(action)||['remove','review','migrate'].includes(direct)))button.hidden=true;
        if(!window.sstCanDownloadDocuments()&&(/"name":"(?:abrirExportacaoRelatorio|gerarRelatorioExecutivo|baixar|v26Baixar|exportar)/.test(action)||direct==='download')){button.hidden=true;button.style.setProperty('display','none','important');}
      }
    };
    nativeObserver=new MutationObserver(hideBlocked);nativeObserver.observe(document.body,{childList:true,subtree:true});hideBlocked();
  }
  document.getElementById('tss-auth-form').addEventListener('submit',async event=>{
    event.preventDefault();if(loggingOut)return;authError('Entrando...');
    const password=document.getElementById('tss-auth-password');
    try{await authToken('password',{email:document.getElementById('tss-auth-email').value.trim(),password:password.value});password.value='';await initNative();}
    catch(error){password.value='';authError(error.message);}
  });
  document.getElementById('tss-auth-recover').textContent='Ajuda para recuperar o acesso';
  document.getElementById('tss-auth-recover').onclick=()=>authError('A recuperação de identidade P2P ainda não está disponível. O acesso atual não foi alterado.');
  async function prepareNativeLogin(){
    try{
      const status=await nativeCall('status');
      if(status.needsOwner){
        const button=document.createElement('button');button.id='sst-native-initialize';button.type='button';button.textContent='Criar administrador inicial neste aparelho';
        button.onclick=async()=>{
          button.disabled=true;const password=document.getElementById('tss-auth-password');
          try{await authToken('initializeOwner',{email:document.getElementById('tss-auth-email').value.trim(),password:password.value});password.value='';button.remove();await initNative();}
          catch(error){password.value='';authError(error.message);button.disabled=false;}
        };
        document.getElementById('tss-auth-form').append(button);
      }
      const field=document.createElement('label');field.textContent='Senha inicial (somente para criar conta neste aparelho)';
      const input=document.createElement('input');input.id='tss-native-user-password';input.type='password';input.minLength=10;input.autocomplete='new-password';field.append(input);document.getElementById('tss-users-form').append(field);
      await initNative();
    }catch(error){authError(error.message);lockApp();}
  }
  let lastActivity=0;
  for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{if(session&&Date.now()-lastActivity>5000){lastActivity=Date.now();nativeCall('activity').catch(()=>{endNativeSession();});}},{passive:true});
  setInterval(async()=>{
    if(!bootFinished||document.hidden)return;
    const status=await nativeCall('status').catch(()=>({locked:true}));
    if(status.locked){bootFinished=false;endNativeSession();return;}
    await window.tssSupabaseReload();
  },20000);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prepareNativeLogin);else setTimeout(prepareNativeLogin,0);
})();
