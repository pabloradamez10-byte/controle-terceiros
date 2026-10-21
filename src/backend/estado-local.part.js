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

