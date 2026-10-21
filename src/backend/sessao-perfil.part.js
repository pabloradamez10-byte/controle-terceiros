  function lockApp(message){
    document.body.classList.remove('tss-authenticated');
    document.getElementById('tss-auth-overlay').hidden = false;
    if (message) authError(message);
  }
  function unlockApp(){
    document.body.classList.add('tss-authenticated');
    document.getElementById('tss-auth-overlay').hidden = true;
    authError('');
    configurePermissionUi();
    if (!document.getElementById('tss-logout')) {
      const button = document.createElement('button');
      button.id = 'tss-logout';
      button.textContent = 'Sair';
      button.style.cssText = 'position:fixed;right:12px;bottom:52px;z-index:99999;padding:7px 12px;border-radius:8px;border:1px solid #cbd5e1;background:white;cursor:pointer';
      button.onclick = () => window.tssSair();
      document.body.appendChild(button);
    }
  }
  function forgetSession(){
    sessionGeneration++; clearTimeout(syncTimer);
    accessController.invalidate(); window.sstSelectedPersonId=null;
    session=null; membership=null; exceptionCache={}; auditBaseline=null; auditStamp=null;
    window.tssUsuarioAtual=()=>null; window.sstClearPrivateData();
    document.querySelector('main')?.replaceChildren();
    document.querySelectorAll('[id^="modal-"],#tss-users-modal,.sst-sensitive-dialog,.sst-report-overlay,.v26-doc-preview-overlay').forEach(node=>{node.replaceChildren();node.hidden=true;});
    lockApp('Sessão encerrada.');
  }
  window.tssSair = async function(){
    if(loggingOut)return; loggingOut=true;
    const token=session?.access_token;
    forgetSession();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
    try {
      await window.sstPurgePrivateCaches();
      if(token)await fetch(SUPABASE_URL+'/auth/v1/logout?scope=local',{method:'POST',cache:'no-store',keepalive:true,signal:controller.signal,headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+token}});
    }catch(error){console.warn('[SST] Sessão local encerrada; revogação remota não confirmada.');}
    finally {clearTimeout(timer);location.reload();}
  };
  async function loadMembership(){
    const userRes = await authorizedFetch(SUPABASE_URL + '/auth/v1/user');
    if (!userRes.ok) throw new Error('Conta não validada');
    const user = await userRes.json();
    window.tssUsuarioAtual = () => ({id:user.id,email:user.email});
    const res = await authorizedFetch(SUPABASE_URL + '/rest/v1/sst_members?user_id=eq.' + encodeURIComponent(user.id) + '&select=role,permissoes,ativo&limit=1');
    if (!res.ok) throw new Error('Permissões indisponíveis');
    membership = (await res.json())[0] || null;
    if (!can('consultar')) throw new Error('Conta sem permissão para consultar');
  }
