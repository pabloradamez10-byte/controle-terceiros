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

