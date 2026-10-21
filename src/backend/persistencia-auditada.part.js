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

