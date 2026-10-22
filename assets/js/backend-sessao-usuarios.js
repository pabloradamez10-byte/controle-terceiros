
/* V28 — Banco real Supabase com sincronização multi-dispositivo
   Base: V27 estável.
   Objetivo: manter o app igual, mas usar Supabase como fonte compartilhada.
   Estratégia: salva um estado único na tabela app_data e usa localStorage apenas como cache/offline.
*/
(function(){
  const SUPABASE_URL = 'https://obzycbtfbadjwwwfpsed.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFkamV3d3dmcHNlZCIsInJlZiI6Im9ienljYnRmYmFkand3d2Zwc2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwODIzMTksImV4cCI6MjA5NzY1ODMxOX0.Ct2U52F6rhIqOSDFFBpcTDYudz6k2FOTzzfMAAcZ05g';

  const STATE_KEY = 'controle_terceiros_sst_state_v1';
  const ENDPOINT = SUPABASE_URL + '/rest/v1/app_data';
  const LOCAL_SYNC_MARK = 'tss_supabase_last_sync';
  const LOCAL_CHANGE_MARK = 'tss_local_last_change';
  const INSTANCE_ID = 'tss_instance_id';
  const SESSION_KEY = 'tss_auth_session';
  const EXCEPTIONS_ENDPOINT = SUPABASE_URL + '/rest/v1/sst_excecoes';
  let session = null;
  let sessionGeneration=0,loggingOut=false;
  let exceptionCache = {};
  let membership = null;
  const USER_FUNCTION = SUPABASE_URL + '/functions/v1/sst-usuarios';
  const ROLE_DEFAULTS = {
    admin:{consultar:true,cadastrar:true,liberar:true},
    cadastro:{consultar:true,cadastrar:true,liberar:false},
    sesmt:{consultar:true,cadastrar:false,liberar:true},
    portaria:{consultar:true,cadastrar:false,liberar:false}
  };
  const can = action => membership?.ativo === true && (membership.role === 'admin' || membership.permissoes?.[action] === true);
  window.tssPode = can;

  const DATA_KEYS = {
    terceiros: 'terceiros',
    empresas: 'empresas',
    treinamentos: 'treinamentos',
    historico: 'historico',
    anexosTerceiros: 'anexosTerceiros',
    anexosEmpresas: 'anexosEmpresas',
    arquivosTerceirosV16: 'arquivosTerceirosV16',
    arquivosEmpresasV26: 'arquivosEmpresasV26'
  };

  let syncTimer = null;
  let isApplyingRemote = false;
  let lastSaveStartedAt = 0;
  let bootFinished = false;

  if (!localStorage.getItem(INSTANCE_ID)) {
    try { localStorage.setItem(INSTANCE_ID, crypto.randomUUID()); }
    catch(e) { localStorage.setItem(INSTANCE_ID, 'inst-' + Date.now() + '-' + Math.random().toString(16).slice(2)); }
  }

  function nowIso(){ return new Date().toISOString(); }
  function parseTime(v){ const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; }
  function safeParse(value, fallback){ try { return JSON.parse(value || ''); } catch(e){ return fallback; } }
  function readKey(key, fallback){ return safeParse(localStorage.getItem(key), fallback); }
  function writeKey(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

  function readLocalState(){
    return {
      schema: 'controle-terceiros-sst-v2',
      updatedAt: nowIso(),
      updatedBy: localStorage.getItem(INSTANCE_ID),
      terceiros: readKey(DATA_KEYS.terceiros, []),
      empresas: readKey(DATA_KEYS.empresas, []),
      treinamentos: readKey(DATA_KEYS.treinamentos, []),
      historico: readKey(DATA_KEYS.historico, []),
      anexosTerceiros: readKey(DATA_KEYS.anexosTerceiros, {}),
      anexosEmpresas: readKey(DATA_KEYS.anexosEmpresas, {}),
      arquivosTerceirosV16: readKey(DATA_KEYS.arquivosTerceirosV16, {}),
      arquivosEmpresasV26: readKey(DATA_KEYS.arquivosEmpresasV26, {})
    };
  }

  function localHasUsefulData(){
    const s = readLocalState();
    return !!(
      (Array.isArray(s.terceiros) && s.terceiros.length) ||
      (Array.isArray(s.empresas) && s.empresas.length) ||
      (Array.isArray(s.treinamentos) && s.treinamentos.length) ||
      (s.arquivosTerceirosV16 && typeof s.arquivosTerceirosV16 === 'object' && Object.keys(s.arquivosTerceirosV16).length) ||
      (s.arquivosEmpresasV26 && typeof s.arquivosEmpresasV26 === 'object' && Object.keys(s.arquivosEmpresasV26).length)
    );
  }

  function markLocalChanged(){
    if (isApplyingRemote) return;
    localStorage.setItem(LOCAL_CHANGE_MARK, nowIso());
  }

  function applyRemoteState(state){
    if (!state || typeof state !== 'object') return;
    isApplyingRemote = true;
    try {
      if (Array.isArray(state.terceiros)) writeKey(DATA_KEYS.terceiros, state.terceiros);
      if (Array.isArray(state.empresas)) writeKey(DATA_KEYS.empresas, state.empresas);
      if (Array.isArray(state.treinamentos)) writeKey(DATA_KEYS.treinamentos, state.treinamentos);
      if (Array.isArray(state.historico)) writeKey(DATA_KEYS.historico, state.historico);
      if (state.anexosTerceiros && typeof state.anexosTerceiros === 'object') writeKey(DATA_KEYS.anexosTerceiros, state.anexosTerceiros);
      if (state.anexosEmpresas && typeof state.anexosEmpresas === 'object') writeKey(DATA_KEYS.anexosEmpresas, state.anexosEmpresas);
      if (state.arquivosTerceirosV16 && typeof state.arquivosTerceirosV16 === 'object') writeKey(DATA_KEYS.arquivosTerceirosV16, state.arquivosTerceirosV16);
      if (state.arquivosEmpresasV26 && typeof state.arquivosEmpresasV26 === 'object') writeKey(DATA_KEYS.arquivosEmpresasV26, state.arquivosEmpresasV26);
      const stamp = state.updatedAt || nowIso();
      localStorage.setItem(LOCAL_SYNC_MARK, stamp);
      localStorage.setItem(LOCAL_CHANGE_MARK, stamp);
    } finally {
      isApplyingRemote = false;
    }
  }

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
  setInterval(()=>{if(bootFinished && session && !document.hidden)window.tssSupabaseReload({silent:true}).catch(()=>{});},20000);
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
  window.abrirExportacaoRelatorio = function(){
    if (membership?.role !== 'admin') return window.gerarRelatorioExecutivo();
    window.sstAbrirRelatorio({request:body=>authorizedFetch(SUPABASE_URL+'/rest/v1/rpc/sst_audit_report',{method:'POST',body:JSON.stringify(body)})});
  };
  function installAuditButton(){
    if(document.getElementById('tss-audit-open')) return;
    const button=document.createElement('button'); button.id='tss-audit-open'; button.type='button'; button.textContent='Auditoria';
    document.getElementById('tss-users-open').after(button);
    button.onclick=()=>{
      const overlay=document.createElement('div'); overlay.className='sst-sensitive-dialog';
      overlay.style.cssText='position:fixed;inset:0;z-index:100001;background:#0008;padding:24px;overflow:auto';
      overlay.innerHTML='<section style="background:white;padding:20px;border-radius:12px;max-width:1100px;margin:auto"><button class="btn btn-ghost" data-close>Fechar</button><h2>Auditoria de alterações</h2><p>Autor pelo login · horário do banco · motivo informado. Registros anteriores à ativação não possuem esta auditoria.</p><label>Pesquisar nos registros carregados <input data-search placeholder="Nome, e-mail ou motivo"></label><div data-rows></div><button class="btn btn-ghost" data-more>Carregar mais</button></section>';
      document.body.appendChild(overlay); overlay.querySelector('[data-close]').onclick=()=>overlay.remove();
      let rows=[],offset=0;
      function render(){
        const term=overlay.querySelector('[data-search]').value.toLocaleLowerCase('pt-BR');
        overlay.querySelector('[data-rows]').innerHTML=rows.filter(r=>JSON.stringify(r).toLocaleLowerCase('pt-BR').includes(term)).map(r=>`<article style="padding:12px 0;border-bottom:1px solid #ddd"><strong>${esc(r.action)} · ${esc(r.entity_type)} · ${esc(r.entity_id)}</strong><p>${esc(r.actor_email)} · ${esc(new Date(r.occurred_at).toLocaleString('pt-BR'))}</p><p><b>Motivo:</b> ${esc(r.reason)}</p><details><summary>Valores anteriores e novos</summary><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px"><div><b>Antes</b><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(r.before_data,null,2))}</pre></div><div><b>Depois</b><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(r.after_data,null,2))}</pre></div></div></details></article>`).join('') || '<p>Nenhum registro encontrado.</p>';
      }
      async function load(){
        const more=overlay.querySelector('[data-more]'); more.disabled=true;
        try {
          const res=await authorizedFetch(SUPABASE_URL+'/rest/v1/sst_audit_log?select=*&order=occurred_at.desc,id.desc&limit=50&offset='+offset);
          if(!res.ok) throw new Error('Falha ao carregar auditoria.');
          const page=await res.json(); rows.push(...page); offset+=page.length; more.hidden=page.length<50; render();
        } catch(e) { overlay.querySelector('[data-rows]').textContent=e.message; } finally {more.disabled=false;}
      }
      overlay.querySelector('[data-search]').oninput=render; overlay.querySelector('[data-more]').onclick=load; load();
    };
  }
  function configurePermissionUi(){
    const userButton = document.getElementById('tss-users-open');
    userButton.hidden = membership?.role !== 'admin';
    if (membership?.role === 'admin') installAuditButton();
    ['tss-audit-open'].forEach(id=>{const b=document.getElementById(id);if(b)b.hidden=membership?.role !== 'admin';});
    document.querySelectorAll('nav button').forEach(button => {
      if (['Cadastro','Dados'].includes(button.textContent.trim())) button.hidden = !can('cadastrar');
    });
    document.querySelectorAll('#page-dashboard button').forEach(button => {
      if (button.textContent.includes('Novo Terceiro')) button.hidden = !can('cadastrar');
    });
    document.querySelectorAll('#page-empresas .page-actions button, #page-treinamentos .page-actions button').forEach(button => {
      button.hidden = !can('cadastrar');
    });
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const userMessage = message => { document.getElementById('tss-users-message').textContent = message; };
  const permissionInputs = {
    consultar:document.getElementById('tss-perm-consultar'),
    cadastrar:document.getElementById('tss-perm-cadastrar'),
    liberar:document.getElementById('tss-perm-liberar')
  };
  document.getElementById('tss-user-role').addEventListener('change', event => {
    const defaults = ROLE_DEFAULTS[event.target.value];
    Object.keys(permissionInputs).forEach(key => { permissionInputs[key].checked = defaults[key]; });
  });
  document.getElementById('tss-users-open').addEventListener('click', async () => {
    if (membership?.role !== 'admin') return;
    document.getElementById('tss-users-modal').hidden = false;
    await refreshUsers();
  });
  document.getElementById('tss-users-close').addEventListener('click', () => { document.getElementById('tss-users-modal').hidden = true; });
  async function refreshUsers(){
    const res = await authorizedFetch(USER_FUNCTION, {method:'GET'});
    if (!res.ok) { userMessage('Não foi possível carregar usuários.'); return; }
    const users = (await res.json()).users || [];
    const list = document.getElementById('tss-users-list');
    list.innerHTML = users.map((u,i) => `<div style="display:flex;align-items:center;gap:8px"><button type="button" data-user-index="${i}" class="btn btn-ghost" style="display:block;width:100%;text-align:left;margin:6px 0">${esc(u.email)} — ${esc(u.role.toUpperCase())} — ${['consultar','cadastrar','liberar'].filter(p=>u.permissoes?.[p]).join(', ')} ${u.ativo ? '' : '(desativado)'}</button><button type="button" class="btn btn-ghost" data-delete-index="${i}" style="color:#b91c1c">Excluir</button></div>`).join('') || '<p>Nenhuma conta encontrada.</p>';
    list.querySelectorAll('[data-delete-index]').forEach(button => button.addEventListener('click', async () => {
      const u = users[Number(button.dataset.deleteIndex)];
      if (!confirm('Excluir o acesso de ' + u.email + '? A pessoa perderá a conta no SST.')) return;
      const motivo = auditReason(); if (!motivo) return;
      button.disabled = true;
      const res = await authorizedFetch(USER_FUNCTION, {method:'POST',body:JSON.stringify({action:'delete',user_id:u.user_id,motivo})}).catch(()=>null);
      const result = await res?.json().catch(()=>({}));
      if (!res?.ok) { userMessage(result?.error || 'Falha ao excluir usuário.'); button.disabled = false; return; }
      userMessage('Usuário excluído.');
      await refreshUsers();
    }));
    list.querySelectorAll('[data-user-index]').forEach(button => button.addEventListener('click', () => {
      const u = users[Number(button.dataset.userIndex)];
      document.getElementById('tss-user-email').value = u.email || '';
      document.getElementById('tss-user-role').value = u.role;
      document.getElementById('tss-user-active').checked = u.ativo;
      Object.keys(permissionInputs).forEach(key => { permissionInputs[key].checked = u.permissoes?.[key] === true; });
      userMessage('Editando ' + u.email);
    }));
  }
  document.getElementById('tss-users-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (membership?.role !== 'admin') return;
    const body = {
      email:document.getElementById('tss-user-email').value.trim(),
      role:document.getElementById('tss-user-role').value,
      permissoes:Object.fromEntries(Object.entries(permissionInputs).map(([k,input])=>[k,input.checked])),
      ativo:document.getElementById('tss-user-active').checked
    };
    body.motivo = auditReason(); if (!body.motivo) return;
    userMessage('Salvando...');
    const res = await authorizedFetch(USER_FUNCTION, {method:'POST',body:JSON.stringify(body)}).catch(()=>null);
    const result = await res?.json().catch(()=>({}));
    if (!res?.ok) { userMessage(result?.error || 'Falha ao salvar usuário.'); return; }
    userMessage(result.message || (result.invited ? 'Usuário salvo e convite enviado.' : 'Permissões atualizadas.'));
    await refreshUsers();
  });
  let guardsInstalled = false;
  function installPermissionGuards(){
    if (guardsInstalled) return;
    guardsInstalled = true;
    const originalShowPage = window.showPage;
    window.showPage = function(page){
      if (!can('cadastrar') && ['cadastro','dados'].includes(page)) {
        toast('⚠ Seu perfil permite apenas consultar e/ou liberar por exceção.');
        return;
      }
      return originalShowPage.apply(this, arguments);
    };
    showPage = window.showPage;
    for (const name of ['salvarTerceiro','salvarEdicao','salvarEmpresa','salvarTreinamento','excluir','excluirEmpresa','importarPlanilhaExcel','abrirModalNovaEmpresa','abrirModalEditarEmpresa','abrirModalNovoTreinamento','abrirModalEditarTreinamento']) {
      const original = window[name];
      if (typeof original !== 'function') continue;
      window[name] = function(){
        if (!can('cadastrar')) { toast('⚠ Sem permissão para cadastrar.'); return; }
        if (['excluir','excluirEmpresa'].includes(name) && membership?.role !== 'admin') { toast('⚠ Exclusão exige ADM.'); return; }
        return original.apply(this,arguments);
      };
    }
    const originalException = window.salvarLiberacaoExcecao;
    window.salvarLiberacaoExcecao = function(){
      if (!can('liberar')) { toast('⚠ Sem permissão para liberar por exceção.'); return; }
      return originalException.apply(this,arguments);
    };
    salvarLiberacaoExcecao = window.salvarLiberacaoExcecao;
    const originalBox = window.renderExcecaoBox;
    window.renderExcecaoBox = function(id){
      if (!can('liberar')) return '<p class="muted-note">Seu perfil pode consultar a situação, sem liberar por exceção.</p>';
      return originalBox(id);
    };
    renderExcecaoBox = window.renderExcecaoBox;
  }
  window.tssExceptionStore = {
    getAll:()=>exceptionCache,
    async reload(){
      const res = await authorizedFetch(SUPABASE_URL+'/rest/v1/rpc/sst_read_exceptions',{method:'POST',body:'{}'});
      if (!res.ok) throw new Error('Falha ao consultar exceções: ' + res.status);
      const rows = await res.json();
      if(!session||!can('consultar'))throw new Error('Sessão encerrada.');
      exceptionCache = Object.fromEntries(rows.map(row => [row.terceiro_id,row.dados]));
      return exceptionCache;
    },
    async save(id, dados){
      if (!can('liberar')) throw new Error('Sem permissão para liberar');
      const reason = auditReason();
      if (!reason) { await window.tssExceptionStore.reload(); throw new Error('Alteração cancelada.'); }
      const res = await authorizedFetch(SUPABASE_URL + '/rest/v1/rpc/sst_save_exception', {
        method:'POST',body:JSON.stringify({p_id:id,p_data:dados,p_reason:reason})
      });
      if (!res.ok) throw new Error('Falha ao salvar exceção: ' + res.status);
      exceptionCache[id] = dados;
      accessController.invalidate(); await accessController.refresh();
    }
  };

  async function fetchRemoteState(){
    const res = await authorizedFetch(SUPABASE_URL+'/rest/v1/rpc/sst_read_state',{method:'POST',body:'{}'});
    if (!res.ok) {
      const txt = await res.text().catch(()=> '');
      throw new Error('Falha ao consultar Supabase: ' + res.status + ' ' + txt.slice(0,180));
    }
    const rows = await res.json();
    if(!session||!can('consultar'))throw new Error('Sessão encerrada.');
    return rows && rows[0] ? rows[0] : null;
  }

  let auditBaseline = null, auditStamp = null, auditSaving = null;
  const stableAuditValue = value => Array.isArray(value) ? value.map(stableAuditValue) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,stableAuditValue(value[k])])) : value;
  const businessState = value => JSON.stringify(stableAuditValue(Object.fromEntries(Object.entries(value || {}).filter(([k])=>!['updatedAt','updatedBy','historico'].includes(k)))));
  function auditReason(){
    let value = prompt('Motivo da alteração (obrigatório, de 3 a 1000 caracteres):');
    while(value !== null && (value.trim().length < 3 || value.trim().length > 1000)) value = prompt('Explique o motivo usando de 3 a 1000 caracteres:');
    return value === null ? null : value.trim();
  }
  async function performAuditedSave(){
    if (isApplyingRemote) return false;
    if (!can('cadastrar')) throw new Error('Sem permissão para cadastrar');
    const localState = readLocalState();
    if (auditBaseline && businessState(localState) === businessState(auditBaseline)) return true;
    const reason = auditReason();
    if (!reason) {
      if (auditBaseline) { applyRemoteState(auditBaseline); renderEverythingSafe(); }
      throw new Error('Alteração cancelada: nenhum dado foi salvo.');
    }
    const res = await authorizedFetch(SUPABASE_URL + '/rest/v1/rpc/sst_save_state', {
      method:'POST', body:JSON.stringify({p_data:localState,p_reason:reason,p_expected:auditStamp})
    });
    if (!res.ok) {
      const problem = await res.json().catch(()=>({}));
      throw new Error(problem.message || 'Falha ao salvar alteração.');
    }
    auditStamp = await res.json(); auditBaseline = localState;
    localStorage.setItem(LOCAL_SYNC_MARK,localState.updatedAt);
    localStorage.setItem(LOCAL_CHANGE_MARK,localState.updatedAt);
    return true;
  }
  function saveRemoteState(){
    if (auditSaving) return auditSaving;
    auditSaving = performAuditedSave().then(result=>{
      if (auditBaseline && businessState(readLocalState()) !== businessState(auditBaseline)) scheduleRemoteSync();
      return result;
    }).finally(()=>{auditSaving=null;});
    return auditSaving;
  }

  function scheduleRemoteSync(delay){
    if (isApplyingRemote) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      saveRemoteState().then(() => {
        accessController.invalidate(); accessController.refresh();
        updateBancoBadge('online');
      }).catch(err => {
        console.warn('[TSS] Supabase sync:', err);
        updateBancoBadge('offline');
        alert(err.message + '\nSe necessário, recarregue o banco antes de tentar novamente.');
      });
    }, delay ?? 800);
  }

  function renderEverythingSafe(){
    const funcs = [
      'atualizarStats','renderDashboard','renderDashboardV11','renderLista','renderEmpresas','renderTreinamentos',
      'renderRankingEmpresas','renderPendencias','renderPortariaExpress','renderCentralPendencias'
    ];
    funcs.forEach(name => { try { if (typeof window[name] === 'function') window[name](); } catch(e){} });
    try { if (typeof popularSelectEmpresas === 'function') popularSelectEmpresas('f-empresa'); } catch(e){}
    try { if (typeof popularSelectEmpresas === 'function') popularSelectEmpresas('e-empresa'); } catch(e){}
  }

  function updateBancoBadge(status){
    let el = document.getElementById('tss-banco-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tss-banco-status';
      el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;padding:8px 10px;border-radius:12px;font:600 12px system-ui;background:#0f172a;color:#fff;box-shadow:0 8px 22px rgba(0,0,0,.22);opacity:.92;';
      document.body.appendChild(el);
    }
    if (status === 'online') {
      el.textContent = 'Banco online';
      el.style.background = '#15803d';
      setTimeout(() => { if (el && el.textContent === 'Banco online') el.style.display = 'none'; }, 2500);
    } else if (status === 'loading') {
      el.style.display = 'block';
      el.textContent = 'Sincronizando banco...';
      el.style.background = '#b45309';
    } else {
      el.style.display = 'block';
      el.textContent = 'Banco sem confirmação online';
      el.style.background = '#991b1b';
    }
  }

  function wrapLocalSavers(){
    const wrap = (name) => {
      const original = window[name];
      if (typeof original !== 'function' || original.__tssWrappedV28) return;
      const wrapped = function(){
        if (name !== 'registrarHistorico' && !can('cadastrar')) {
          if (typeof toast === 'function') toast('⚠ Seu perfil não permite alterar cadastros.');
          return false;
        }
        const result = original.apply(this, arguments);
        if (!can('cadastrar')) return result;
        markLocalChanged();
        scheduleRemoteSync();
        return result;
      };
      wrapped.__tssWrappedV28 = true;
      window[name] = wrapped;
    };

    [
      'saveAll','saveAllEmpresas','saveAllTreinamentos',
      'setAnexosTerceiro','setArquivosTerceiroV16','setArquivosEmpresaV26',
      'registrarHistorico','importarPlanilhaExcel','importarBackupJSON'
    ].forEach(wrap);
  }

  async function initSupabaseReal(){
    if(!window.sstSecurityReady){lockApp('Não foi possível carregar a proteção do aplicativo. Atualize a página.');return;}
    wrapLocalSavers();
    updateBancoBadge('loading');
    try {
      if (!await ensureSession()) { lockApp(); return; }
      await loadMembership();
      installPermissionGuards();
      const remote = await fetchRemoteState();
      if (!remote?.data) throw new Error('Base não encontrada no banco.');
      auditStamp=remote.updated_at; auditBaseline=remote.data;
      applyRemoteState(remote.data);
      await Promise.all([
        window.tssExceptionStore.reload(),
        accessController.refresh()
      ]);
      localStorage.removeItem('liberacoesExcecao');
      renderEverythingSafe();
      bootFinished = true;
      unlockApp();
      updateBancoBadge('online');
    } catch (err) {
      console.warn('[TSS] Supabase inicialização:', err);
      lockApp('Não foi possível carregar a base autorizada. Tente entrar novamente.');
    }
  }

  document.getElementById('tss-auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (loggingOut || document.getElementById('tss-new-password')) return;
    authError('Entrando...');
    try {
      await authToken('password', {
        email:document.getElementById('tss-auth-email').value.trim(),
        password:document.getElementById('tss-auth-password').value
      });
      document.getElementById('tss-auth-password').value = '';
      await initSupabaseReal();
    } catch(e) { authError(e.message); }
  });
  document.getElementById('tss-auth-recover').addEventListener('click', async () => {
    const email = document.getElementById('tss-auth-email').value.trim();
    if (!email) { authError('Informe seu e-mail para receber o link.'); return; }
    const res = await fetch(SUPABASE_URL + '/auth/v1/recover?redirect_to=' + encodeURIComponent(location.origin + location.pathname), {
      method:'POST', headers:{apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email})
    }).catch(()=>null);
    authError(res?.ok ? 'Confira seu e-mail para redefinir a senha.' : 'Não foi possível enviar o link agora.');
  });

  const recoveryParams = new URLSearchParams(location.hash.slice(1));
  if (['recovery','invite'].includes(recoveryParams.get('type')) && recoveryParams.get('access_token')) {
    session = {
      access_token:recoveryParams.get('access_token'),
      refresh_token:recoveryParams.get('refresh_token'),
      expires_at:Math.floor(Date.now()/1000) + Number(recoveryParams.get('expires_in') || 3600)
    };
    sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
    history.replaceState(null,'',location.pathname + location.search);
    const form = document.getElementById('tss-auth-form');
    form.innerHTML = '<h2>Nova senha</h2><label>Senha nova<input id="tss-new-password" type="password" minlength="8" required></label><button type="submit">Salvar senha</button><div id="tss-auth-error" role="alert"></div>';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const res = await authorizedFetch(SUPABASE_URL + '/auth/v1/user', {
        method:'PUT',body:JSON.stringify({password:document.getElementById('tss-new-password').value})
      });
      if (!res.ok) { authError('Não foi possível redefinir a senha.'); return; }
      location.reload();
    });
  }
  window.tssSupabaseSyncNow = async function(){
    updateBancoBadge('loading');
    try {
      await saveRemoteState();
      await accessController.refresh();
      updateBancoBadge('online');
      if (typeof toast === 'function') toast('✓ Banco sincronizado.');
      return true;
    } catch(err) {
      console.error(err);
      updateBancoBadge('offline');
      alert(err.message);
      return false;
    }
  };

  window.tssSupabaseReload = async function(options={}){
    if (auditSaving || (auditBaseline && businessState(readLocalState()) !== businessState(auditBaseline))) return false;
    const silent = options?.silent === true;
    if (!silent) updateBancoBadge('loading');
    try {
      const revision=window.sstPrivateRevision;
      const remote = await fetchRemoteState();
      if(revision!==window.sstPrivateRevision || auditSaving)return false;
      if (remote && remote.data) {
        auditStamp=remote.updated_at; auditBaseline=remote.data;
        applyRemoteState(remote.data);
        await Promise.all([
          window.tssExceptionStore.reload(),
          accessController.refresh()
        ]);
        renderEverythingSafe();
        if (!silent) {
          updateBancoBadge('online');
          if (typeof toast === 'function') toast('✓ Dados recarregados do Supabase.');
        }
        return true;
      }
      if (!silent) {
        updateBancoBadge('online');
        if (typeof toast === 'function') toast('Nenhum dado encontrado no Supabase.');
      }
      return false;
    } catch(err) {
      console.error(err);
      updateBancoBadge('offline');
      if (!silent && typeof toast === 'function') toast('⚠ Falha ao recarregar banco.');
      return false;
    }
  };

  // Sincronização leve ao voltar para a aba/app, sem bloquear a interface.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && bootFinished) {
      window.tssSupabaseReload({silent:true}).catch(()=>{});
    }
  });

  // Atalho de emergência para testar no console:
  // tssSupabaseSyncNow() envia este aparelho ao banco.
  // tssSupabaseReload() baixa do banco para este aparelho.
  if (!document.getElementById('tss-new-password')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSupabaseReal);
    } else {
      setTimeout(initSupabaseReal, 0);
    }
  }
})();