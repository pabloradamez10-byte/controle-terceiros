
/* V28 — Banco real Supabase com sincronização multi-dispositivo
   Base: V27 estável.
   Objetivo: manter o app igual, mas usar Supabase como fonte compartilhada.
   Estratégia: salva um estado único na tabela app_data e usa localStorage apenas como cache/offline.
*/
(function(){
  const SUPABASE_URL = 'https://obzycbtfbadjwwwfpsed.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ienljYnRmYmFkand3d2Zwc2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwODIzMTksImV4cCI6MjA5NzY1ODMxOX0.Ct2U52F6rhIqOSDFFBpcTDYudz6k2FOTzzfMAAcZ05g';

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

