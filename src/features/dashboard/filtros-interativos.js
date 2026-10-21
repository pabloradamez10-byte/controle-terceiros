  (function configurarV191DashboardInterativo(){
    const css = document.createElement('style');
    css.textContent = `
      #status-filter-banner { border-left: 5px solid var(--accent); }
      .stat-card.stat-click, #page-listagem .stat-card.stat-click { cursor: pointer; user-select: none; }
      .stat-card.stat-click:active, #page-listagem .stat-card.stat-click:active { transform: scale(.98); }
      .stat-card.active-filter { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(21,94,239,.12), var(--shadow-sm); }
    `;
    document.head.appendChild(css);
  })();

  function v191StatusKey(t) {
    const st = getStatus(t);
    if (st.excecao) return 'excecoes';
    if (st.pendente && !st.bloqueado) return 'pendentes';
    if (st.ok && !st.pendente && !st.bloqueado) return 'liberados';
    if (st.bloqueado) return 'bloqueados';
    return 'pendentes';
  }

  function v191FiltrarListaPorStatus(lista, status) {
    if (!status || status === 'todos') return lista;
    return lista.filter(t => v191StatusKey(t) === status);
  }

  function v191LabelStatus(status) {
    return ({
      todos: 'Todos os terceiros',
      liberados: 'Terceiros liberados',
      bloqueados: 'Terceiros bloqueados',
      pendentes: 'Terceiros pendentes',
      excecoes: 'Liberados por exceção'
    })[status] || 'Terceiros cadastrados';
  }

  function v191ContagensStatus(lista) {
    const c = { todos: lista.length, liberados:0, bloqueados:0, pendentes:0, excecoes:0 };
    lista.forEach(t => { const k = v191StatusKey(t); if (c[k] !== undefined) c[k]++; });
    return c;
  }

  function v191AplicarAcoesCards() {
    const mapDash = [
      ['dash-total','todos'],
      ['dash-liberados','liberados'],
      ['dash-bloqueados','bloqueados'],
      ['dash-excecoes','excecoes'],
      ['dash-pendentes','pendentes']
    ];
    mapDash.forEach(([id,status]) => {
      const el = document.getElementById(id);
      const card = el && el.closest('.stat-card');
      if (!card) return;
      card.classList.add('stat-click');
      card.setAttribute('role','button');
      card.setAttribute('tabindex','0');
      card.dataset.statusFiltro = status;
      if (!card.querySelector('.stat-hint')) {
        const hint = document.createElement('span');
        hint.className = 'stat-hint';
        hint.textContent = status === 'todos' ? 'Toque para ver todos' : `Toque para ver ${v191LabelStatus(status).toLowerCase()}`;
        card.appendChild(hint);
      }
    });

    const mapList = [
      ['stat-total','todos'],
      ['stat-liberados','liberados'],
      ['stat-bloqueados','bloqueados']
    ];
    mapList.forEach(([id,status]) => {
      const el = document.getElementById(id);
      const card = el && el.closest('.stat-card');
      if (!card) return;
      card.classList.add('stat-click');
      card.setAttribute('role','button');
      card.setAttribute('tabindex','0');
      card.dataset.statusFiltro = status;
    });
  }

  document.addEventListener('click', function(e){
    const card = e.target.closest('[data-status-filtro]');
    if (!card) return;
    const status = card.dataset.statusFiltro || 'todos';
    abrirListaPorStatus(status);
  }, true);

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-status-filtro]');
    if (!card) return;
    e.preventDefault();
    abrirListaPorStatus(card.dataset.statusFiltro || 'todos');
  }, true);

  abrirListaPorStatus = function(status) {
    window.filtroStatusDashboard = status || 'todos';
    const busca = document.getElementById('busca-lista');
    if (busca) busca.value = '';
    const filtroEmpresa = document.getElementById('filtro-empresa-lista');
    if (filtroEmpresa) filtroEmpresa.value = '';
    showPage('listagem');
    setTimeout(function(){
      atualizarBannerFiltroStatus();
      renderLista();
      const alvo = document.getElementById('status-filter-banner') || document.getElementById('page-listagem');
      if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({ behavior:'smooth', block:'start' });
    }, 30);
  };

  atualizarBannerFiltroStatus = function() {
    const filtro = window.filtroStatusDashboard || '';
    const banner = document.getElementById('status-filter-banner');
    const title = document.getElementById('status-filter-title');
    const sub = document.getElementById('status-filter-sub');
    const titulo = document.getElementById('titulo-listagem-terceiros');
    if (!banner) return;
    const label = v191LabelStatus(filtro || 'todos');
    if (!filtro || filtro === 'todos') {
      banner.style.display = 'none';
      if (titulo) titulo.textContent = 'Terceiros Cadastrados';
    } else {
      banner.style.display = 'block';
      if (title) title.textContent = label;
      if (sub) sub.textContent = 'Filtro aplicado pelo Dashboard. A lista abaixo mostra somente este grupo.';
      if (titulo) titulo.textContent = label;
    }
    document.querySelectorAll('[data-status-filtro]').forEach(c => c.classList.toggle('active-filter', (c.dataset.statusFiltro || '') === filtro && filtro !== 'todos'));
  };

  limparFiltroStatusDashboard = function() {
    window.filtroStatusDashboard = '';
    const busca = document.getElementById('busca-lista');
    if (busca) busca.value = '';
    atualizarBannerFiltroStatus();
    renderLista();
  };

  const _renderDashboardV191 = renderDashboard;
  renderDashboard = function() {
    _renderDashboardV191();
    setTimeout(v191AplicarAcoesCards, 10);
  };

  const _renderListaV191Base = renderLista;
  renderLista = function() {
    const filtroStatus = window.filtroStatusDashboard || '';
    if (!filtroStatus || filtroStatus === 'todos') {
      const r = _renderListaV191Base();
      setTimeout(function(){ atualizarBannerFiltroStatus(); v191AplicarAcoesCards(); }, 10);
      return r;
    }

    atualizarStats();
    atualizarBannerFiltroStatus();
    v191AplicarAcoesCards();

    const buscaEl = document.getElementById('busca-lista');
    const filtroEl = document.getElementById('filtro-empresa-lista');
    const q = (buscaEl?.value || '').toLowerCase().trim();
    const empresaFiltro = filtroEl?.value || '';
    let lista = getAll();

    if (q) lista = lista.filter(t => correspondeBuscaTerceiroSST(q, t));
    if (empresaFiltro) lista = lista.filter(t => t.empresaId === empresaFiltro || t.empresa === empresaFiltro);
    lista = v191FiltrarListaPorStatus(lista, filtroStatus);

    // No filtro ativo, os cards superiores passam a refletir somente a lista exibida.
    const c = v191ContagensStatus(lista);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-total', lista.length);
    set('stat-liberados', c.liberados);
    set('stat-bloqueados', c.bloqueados);
    set('stat-empresas', new Set(lista.map(t => t.empresa || t.empresaId).filter(Boolean)).size);

    const tbody = document.getElementById('tabela-body');
    const empty = document.getElementById('lista-empty');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!lista.length) {
      if (empty) {
        empty.style.display = 'block';
        const p = empty.querySelector('p');
        if (p) p.textContent = 'Nenhum terceiro encontrado para este filtro.';
      }
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

  setTimeout(function(){ try { v191AplicarAcoesCards(); atualizarBannerFiltroStatus(); } catch(e) { console.warn('V19.1 dashboard:', e); } }, 120);



  // ──────────────────────────────────────────────────
  //  V21 — Painel de Empresa + Alertas automáticos interativos
  // ──────────────────────────────────────────────────
