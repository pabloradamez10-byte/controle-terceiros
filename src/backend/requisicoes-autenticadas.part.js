  function sbHeaders(extra){
    return Object.assign({
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + (session?.access_token || ''),
      'Content-Type': 'application/json'
    }, extra || {});
  }

  function authError(message){ document.getElementById('tss-auth-error').textContent = message || ''; }
  async function authToken(grant, credentials){
    const generation=sessionGeneration;
    const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=' + grant, {
      method:'POST', headers:{apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'},
      body:JSON.stringify(credentials)
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) throw new Error('Não foi possível entrar. Confira o e-mail e a senha.');
    if(generation!==sessionGeneration)throw new Error('Sessão encerrada.');
    session = data;
    session.expires_at = Math.floor(Date.now()/1000) + (data.expires_in || 3600);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  async function ensureSession(){
    if (!session) {
      try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch(e) { session = null; }
    }
    if (!session?.refresh_token) return false;
    if ((session.expires_at || 0) < Math.floor(Date.now()/1000) + 90) {
      try { await authToken('refresh_token', {refresh_token:session.refresh_token}); }
      catch(e) { session = null; sessionStorage.removeItem(SESSION_KEY); return false; }
    }
    return true;
  }
  async function authorizedFetch(url, options={}){
    if (!await ensureSession()) {forgetSession();location.reload();throw new Error('Sessão expirada. Entre novamente.');}
    const generation=sessionGeneration;
    const response=await fetch(url, {...options,cache:'no-store',headers:sbHeaders(options.headers)});
    if(generation!==sessionGeneration)throw new Error('Sessão encerrada.');
    return response;
  }
