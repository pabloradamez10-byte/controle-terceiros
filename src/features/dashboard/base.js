  function atualizarStats() {
    const terceiros = getAll();
    const empresas = (typeof getAllEmpresas === 'function') ? getAllEmpresas() : [];
    const treinamentos = (typeof getAllTreinamentos === 'function') ? getAllTreinamentos() : [];
    const liberados = terceiros.filter(t => getStatus(t).ok).length;
    const bloqueados = terceiros.length - liberados;
    const pendenciasTreino = contarTreinamentosRegistrados(terceiros);
    const empresasComExigencias = empresas.filter(e => (e.treinamentosObrigatorios || []).length > 0).length;
    const pendenciasGerais = montarPendencias().total;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('stat-total', terceiros.length);
    set('stat-liberados', liberados);
    set('stat-bloqueados', bloqueados);
    set('stat-empresas', empresas.length);
    set('stat-pendencias-treino', pendenciasTreino);

    set('dash-total', terceiros.length);
    set('dash-liberados', liberados);
    set('dash-bloqueados', bloqueados);
    set('dash-empresas', empresas.length);
    set('dash-pendencias', pendenciasGerais);
    set('dash-treinamentos', treinamentos.length);
    set('dash-empresas-exigencias', empresasComExigencias);
    set('dash-status-geral', bloqueados === 0 ? 'OK' : 'ATENÇÃO');
  }

  function renderDashboard() {
    atualizarStats();
    const wrap = document.getElementById('dash-lista-bloqueados');
    if (!wrap) return;
    const bloqueados = getAll().map(t => ({...t, status:getStatus(t)})).filter(t => !t.status.ok);
    if (!bloqueados.length) {
      wrap.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhum terceiro bloqueado ou pendente no momento.</p>';
      return;
    }
    wrap.innerHTML = bloqueados.map(t => `
      <div class="dash-item" role="button" tabindex="0" onclick="abrirAnalise('${t.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){abrirAnalise('${t.id}')}">
        <div><strong>${escapeHtmlSafeV131(t.nome)}</strong><small>${escapeHtmlSafeV131(t.empresa || 'Sem empresa')} • ${t.cpf || 'CPF não informado'}</small></div>
        <div class="dash-motivos">${t.status.motivos.slice(0,3).join('<br>')}</div>
      </div>`).join('');
  }

  // ──────────────────────────────────────────────────
  //  LISTAGEM
  // ──────────────────────────────────────────────────
