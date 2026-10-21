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
      await window.tssExceptionStore.reload();
      localStorage.removeItem('liberacoesExcecao');
      await accessController.refresh();
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

  window.tssSupabaseReload = async function(){
    if (auditSaving || (auditBaseline && businessState(readLocalState()) !== businessState(auditBaseline))) return false;
    updateBancoBadge('loading');
    try {
      const revision=window.sstPrivateRevision;
      const remote = await fetchRemoteState();
      if(revision!==window.sstPrivateRevision || auditSaving)return false;
      if (remote && remote.data) {
        auditStamp=remote.updated_at; auditBaseline=remote.data;
        applyRemoteState(remote.data);
        await window.tssExceptionStore.reload();
        await accessController.refresh();
        renderEverythingSafe();
        updateBancoBadge('online');
        if (typeof toast === 'function') toast('✓ Dados recarregados do Supabase.');
        return true;
      }
      updateBancoBadge('online');
      if (typeof toast === 'function') toast('Nenhum dado encontrado no Supabase.');
      return false;
    } catch(err) {
      console.error(err);
      updateBancoBadge('offline');
      if (typeof toast === 'function') toast('⚠ Falha ao recarregar banco.');
      return false;
    }
  };

  // Sincronização leve ao voltar para a aba/app.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && bootFinished) {
      window.tssSupabaseReload().catch(()=>{});
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
