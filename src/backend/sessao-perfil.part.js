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
