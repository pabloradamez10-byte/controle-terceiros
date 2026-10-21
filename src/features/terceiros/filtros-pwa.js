  window.filtroStatusDashboard = window.filtroStatusDashboard || '';

  function labelFiltroStatus(status) {
    const labels = {
      todos: 'Todos os terceiros',
      liberados: 'Terceiros liberados',
      bloqueados: 'Terceiros bloqueados',
      excecoes: 'Liberados por exceção',
      pendentes: 'Terceiros pendentes'
    };
    return labels[status] || 'Terceiros cadastrados';
  }

  function aplicarFiltroStatusLista(lista) {
    const filtro = window.filtroStatusDashboard || '';
    if (!filtro || filtro === 'todos') return lista;
    return lista.filter(t => {
      const st = getStatus(t);
      if (filtro === 'liberados') return st.ok && !st.excecao && !st.pendente && !st.bloqueado;
      if (filtro === 'bloqueados') return st.bloqueado && !st.excecao;
      if (filtro === 'excecoes') return !!st.excecao;
      if (filtro === 'pendentes') return st.pendente && !st.excecao && !st.bloqueado;
      return true;
    });
  }

  function atualizarBannerFiltroStatus() {
    const filtro = window.filtroStatusDashboard || '';
    const banner = document.getElementById('status-filter-banner');
    const title = document.getElementById('status-filter-title');
    const sub = document.getElementById('status-filter-sub');
    const titulo = document.getElementById('titulo-listagem-terceiros');
    if (!banner) return;
    if (!filtro || filtro === 'todos') {
      banner.style.display = 'none';
      if (titulo) titulo.textContent = 'Terceiros Cadastrados';
      return;
    }
    const label = labelFiltroStatus(filtro);
    banner.style.display = 'block';
    if (title) title.textContent = label;
    if (sub) sub.textContent = 'Filtro aberto pelo Dashboard. Use limpar filtro para voltar à lista completa.';
    if (titulo) titulo.textContent = label;
  }

  function abrirListaPorStatus(status) {
    window.filtroStatusDashboard = status || 'todos';
    showPage('listagem');
    setTimeout(() => {
      const busca = document.getElementById('busca-lista');
      if (busca) busca.value = '';
      atualizarBannerFiltroStatus();
      renderLista();
    }, 50);
  }

  function limparFiltroStatusDashboard() {
    window.filtroStatusDashboard = '';
    atualizarBannerFiltroStatus();
    renderLista();
  }

  const _renderListaV19 = renderLista;
  renderLista = function() {
    atualizarBannerFiltroStatus();
    const filtroStatus = window.filtroStatusDashboard || '';
    if (!filtroStatus || filtroStatus === 'todos') {
      return _renderListaV19();
    }

    atualizarStats();
    const buscaEl = document.getElementById('busca-lista');
    const filtroEl = document.getElementById('filtro-empresa-lista');
    const q = (buscaEl?.value || '').toLowerCase().trim();
    const empresaFiltro = filtroEl?.value || '';
    let lista = getAll();

    if (q) lista = lista.filter(t => correspondeBuscaTerceiroSST(q, t));
    if (empresaFiltro) lista = lista.filter(t => t.empresaId === empresaFiltro || t.empresa === empresaFiltro);
    lista = aplicarFiltroStatusLista(lista);

    const tbody = document.getElementById('tabela-body');
    const empty = document.getElementById('lista-empty');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!lista.length) {
      if (empty) { empty.style.display = 'block'; empty.querySelector('p') && (empty.querySelector('p').textContent = 'Nenhum terceiro encontrado para este filtro.'); }
      return;
    }
    if (empty) empty.style.display = 'none';

    lista.forEach(t => {
      const st = getStatus(t);
      const stDP = getStatusDP(t);
      const stSESMT = getStatusSESMT(t);
      const obrig = getTreinosObrigatoriosDaEmpresa(t.empresaId);
      const pendTreinos = obrig.filter(tr => !getStatusTreinamentoTerceiro(t, tr).ok).length;
      const badgeStatus = st.excecao
        ? '<span class="badge badge-exception">🟡 Exceção</span>'
        : (st.ok && !st.pendente ? '<span class="badge badge-ok">✓ Liberado</span>' : (st.pendente ? '<span class="badge badge-warn">Pendente</span>' : '<span class="badge badge-blocked">✕ Bloqueado</span>'));
      const badgeDP = stDP.ok ? '<span class="badge badge-ok">DP OK</span>' : '<span class="badge badge-blocked">DP</span>';
      const badgeSESMT = stSESMT.ok ? '<span class="badge badge-ok">SESMT OK</span>' : '<span class="badge badge-blocked">SESMT</span>';
      const badgeTreino = badgeTreinamentosComplementares(t);
      const ex = getExcecaoTerceiro(t.id);

      const tr = document.createElement('tr');
      tr.className = 'terceiro-card-row';
      tr.innerHTML = `
        <td colspan="10">
          <div class="terceiro-card" role="button" tabindex="0" data-terceiro-id="${t.id}" onclick="abrirAnalise('${t.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){abrirAnalise('${t.id}')}">
            <div class="terceiro-card-top">
              <div>
                <div class="terceiro-card-name">${escapeHtmlSafeV131(t.nome || 'Sem nome')}</div>
                <div class="terceiro-card-meta">${escapeHtmlSafeV131(t.empresa || 'Empresa não vinculada')} • ${escapeHtmlSafeV131(t.cpf || 'CPF não informado')}</div>
              </div>
              <div>${badgeStatus}</div>
            </div>
            <div class="terceiro-card-grid">
              <div class="terceiro-card-info"><label>Função</label><div>${escapeHtmlSafeV131(t.funcao || 'Não informada')}</div></div>
              <div class="terceiro-card-info"><label>ASO</label><div>${fmtData(t.aso)} ${tagData(t.aso)}</div></div>
              <div class="terceiro-card-info"><label>Integração</label><div>${fmtData(t.integ)} ${tagData(t.integ)}</div></div>
              <div class="terceiro-card-info"><label>Liberação</label><div>${ex ? 'Até ' + fmtData(ex.dataAte) : 'Sem exceção ativa'}</div></div>
            </div>
            <div class="terceiro-card-actions">
              ${badgeDP} ${badgeSESMT} ${badgeTreino}
              <span class="terceiro-card-hint">Toque para abrir ficha vertical</span>
            </div>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js')
        .then(function () { console.log('Service Worker registrado.'); })
        .catch(function (error) { console.warn('Falha ao registrar Service Worker:', error); });
    });
  }

  // ──────────────────────────────────────────────────
  //  V16.1 — Exceção com múltiplos motivos/documentos
  // ──────────────────────────────────────────────────
