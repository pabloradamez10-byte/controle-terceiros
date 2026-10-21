  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
