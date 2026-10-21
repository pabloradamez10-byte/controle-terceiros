  (function configurarLiberacaoExcecao(){
    const css = document.createElement('style');
    css.textContent = `
      .badge-exception { background:#FEF3C7; color:#B45309; }
      .badge-imported { background:#DBEAFE; color:#1D4ED8; }
      .status-mini.imported { background:#DBEAFE; color:#1D4ED8; }

      .stat-exception .stat-value { color:#D97706; }
      .stat-pending .stat-value { color:#D97706; }
      .status-icon.exception { background:var(--warn-lt); color:var(--warn); }
      .status-label.exception { color:var(--warn); }
      .exception-box { border:1px solid #FBBF24; background:#FFFBEB; border-radius:14px; padding:16px; margin-top:14px; }
      .exception-box strong { color:#92400E; }
      .exception-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }
      .exception-grid .full { grid-column:1 / -1; }
      .exception-active { background:#FFFBEB; border:1px solid #FBBF24; border-radius:12px; padding:12px; margin-top:10px; color:#78350F; }
      .exception-list { display:flex; flex-direction:column; gap:10px; }
      .exception-item { border:1px solid var(--border); border-radius:12px; padding:12px; display:grid; grid-template-columns:1fr auto; gap:12px; align-items:start; }
      .exception-item small { display:block; color:var(--muted); margin-top:4px; }
      @media (max-width: 640px) { .exception-grid { grid-template-columns:1fr; } .exception-item { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(css);

    const primeiroGrid = document.querySelector('#page-dashboard .stats-grid');
    if (primeiroGrid && !document.getElementById('dash-excecoes')) {
      const card = document.createElement('div');
      card.className = 'stat-card stat-exception stat-click';
      card.setAttribute('onclick', "abrirListaPorStatus('excecoes')");
      card.innerHTML = '<div class="stat-label">Liberados por Exceção</div><div class="stat-value" id="dash-excecoes">0</div><span class="stat-hint">Toque para ver exceções</span>';
      primeiroGrid.appendChild(card);
      const cardPend = document.createElement('div');
      cardPend.className = 'stat-card stat-pending stat-click';
      cardPend.setAttribute('onclick', "abrirListaPorStatus('pendentes')");
      cardPend.innerHTML = '<div class="stat-label">Pendentes</div><div class="stat-value" id="dash-pendentes">0</div><span class="stat-hint">Toque para ver pendentes</span>';
      primeiroGrid.appendChild(cardPend);
    }

    const rankingCard = document.getElementById('dash-ranking-empresas')?.closest('.card');
    if (rankingCard && !document.getElementById('dash-excecoes-list')) {
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = '<div class="card-title">Liberações por Exceção</div><div id="dash-excecoes-list" class="exception-list"></div>';
      rankingCard.insertAdjacentElement('afterend', div);
    }
  })();

  function getAllExcecoes() {
    return window.tssExceptionStore?.getAll() || {};
  }

  function saveAllExcecoes(data) {
    throw new Error('Use o salvamento individual de exceções no banco.');
  }

  function getExcecaoTerceiro(id) {
    const all = getAllExcecoes();
    const ex = all[id];
    return ex && ex.ativo ? ex : null;
  }

  function getStatusBaseSemExcecao(t) {
    const dp = getStatusDP(t);
    const sesmt = getStatusSESMT(t);
    const motivos = [...dp.motivos, ...sesmt.motivos];
    const avisos = [...dp.avisos, ...sesmt.avisos];
    const bloqueado = motivos.length > 0;
    // Avisos de DP ou proximidade do vencimento não geram pendência de acesso.
    const pendente = !bloqueado && sesmt.avisos.some(aviso =>
      aviso === 'Integração sem data informada' ||
      aviso === 'Documentos SESMT sem data informada');
    return { ok: !bloqueado && !pendente, bloqueado, pendente, excecao:false, motivos, avisos, dp, sesmt };
  }

  function statusImportadoLiberado(t) {
    const raw = (t.situacaoAcessoImportada || t.situacaoAcesso || t.statusAcesso || '').toString();
    const norm = normalizarTexto(raw);
    return norm.includes('acesso liberado') || norm === 'liberado' || norm.includes('liberado');
  }

  function statusImportadoNegado(t) {
    const raw = (t.situacaoAcessoImportada || t.situacaoAcesso || t.statusAcesso || '').toString();
    const norm = normalizarTexto(raw);
    return norm.includes('acesso negado') || norm === 'bloqueado' || norm.includes('negado');
  }

  getStatus = function(t) {
    const base = getStatusBaseSemExcecao(t);
    const ex = getExcecaoTerceiro(t.id);

    // A exceção operacional não substitui o ASO válido do prestador de serviço.
    const pendenciasAtuais = [...base.motivos, ...base.avisos];
    const cobrePendencias = Array.isArray(ex?.pendenciasAutorizadas) && pendenciasAtuais.every(p => ex.pendenciasAutorizadas.includes(p));
    if (ex && cobrePendencias && statusData(t.aso).classe !== 'blocked' && !statusData(t.aso).semData && (base.bloqueado || base.pendente)) {
      return {
        ...base,
        ok: true,
        bloqueado: false,
        pendente: false,
        excecao: true,
        excecaoDados: ex,
        statusTexto: 'LIBERADO POR EXCEÇÃO'
      };
    }

    // Situação importada é apenas histórico; nunca determina a autorização atual.
    return { ...base, statusTexto: base.ok && !base.pendente ? 'LIBERADO' : (base.pendente ? 'PENDENTE' : 'BLOQUEADO') };
  };

  function salvarLiberacaoExcecao(id) {
    const t = getAll().find(x => x.id === id);
    if (!t) return;

    const dataLiberacao = document.getElementById('exc-data')?.value || '';
    const aprovador = document.getElementById('exc-aprovador')?.value.trim() || '';
    const cargo = document.getElementById('exc-cargo')?.value || '';
    const motivo = document.getElementById('exc-motivo')?.value || '';
    const obs = document.getElementById('exc-obs')?.value.trim() || '';

    if (!dataLiberacao || !aprovador || !cargo || !motivo) {
      toast('⚠ Preencha data, aprovador, cargo e motivo da exceção.');
      return;
    }

    if (dataLiberacao < hoje()) {
      toast('⚠ A data da liberação por exceção não pode ser retroativa.');
      return;
    }

    const all = getAllExcecoes();
    all[id] = {
      id: uid(),
      terceiroId: id,
      terceiro: t.nome || '',
      empresa: t.empresa || '',
      cpf: t.cpf || '',
      ativo: true,
      dataLiberacao,
      aprovador,
      cargo,
      motivo,
      obs,
      criadoEm: new Date().toISOString()
    };
    saveAllExcecoes(all);
    registrarHistorico('terceiro', id, `Liberação por exceção registrada por ${aprovador} (${cargo}). Motivo: ${motivo}. Data: ${fmtData(dataLiberacao)}.`);
    toast('✓ Liberação por exceção registrada.');
    abrirAnalise(id);
    renderDashboard();
  }

  async function cancelarLiberacaoExcecao(id) {
    const ex = getExcecaoTerceiro(id);
    if (!ex) return;
    if (!confirm('Cancelar a liberação por exceção deste terceiro?')) return;
    const all = { ...getAllExcecoes() };
    all[id] = { ...all[id], ativo:false, canceladoEm:new Date().toISOString() };
    try { await window.tssExceptionStore.save(id, all[id]); }
    catch(e) { toast('⚠ A exceção não foi cancelada no banco.'); return; }
    registrarHistorico('terceiro', id, 'Liberação por exceção cancelada.');
    toast('Liberação por exceção cancelada.');
    abrirAnalise(id);
    renderDashboard();
  }

  function renderExcecaoBox(id) {
    const ex = getExcecaoTerceiro(id);
    if (ex) {
      return `
        <div class="exception-box">
          <strong>🟡 Liberado por Exceção</strong>
          <div class="exception-active">
            <b>Data da liberação:</b> ${fmtData(ex.dataLiberacao)}<br>
            <b>Aprovador:</b> ${ex.aprovador}<br>
            <b>Cargo:</b> ${ex.cargo}<br>
            <b>Motivo:</b> ${ex.motivo}<br>
            ${ex.obs ? `<b>Observação:</b> ${ex.obs}<br>` : ''}
            <small>Registrado em ${new Date(ex.criadoEm).toLocaleString('pt-BR')}</small>
          </div>
          <div style="margin-top:10px;"><button class="btn btn-danger" onclick="cancelarLiberacaoExcecao('${id}')">Cancelar exceção</button></div>
        </div>`;
    }
    return `
      <div class="exception-box">
        <strong>Liberação por Exceção</strong>
        <p style="font-size:13px;color:#92400E;margin-top:6px;">Use somente quando houver autorização formal para entrada mesmo com pendências. A data não pode ser retroativa.</p>
        <div class="exception-grid">
          <div><label>Data da liberação *</label><input id="exc-data" type="date" min="${hoje()}" value="${hoje()}"></div>
          <div><label>Cargo do aprovador *</label><select id="exc-cargo"><option value="">Selecione...</option><option>Gerente da Planta</option><option>Supervisor Industrial</option><option>Coordenador Industrial</option><option>Outro</option></select></div>
          <div class="full"><label>Nome do aprovador *</label><input id="exc-aprovador" placeholder="Ex.: João da Silva"></div>
          <div class="full"><label>Motivo *</label><select id="exc-motivo"><option value="">Selecione...</option><option>ASO pendente</option><option>Integração pendente</option><option>Documento DP pendente</option><option>Emergência operacional</option><option>Outro</option></select></div>
          <div class="full"><label>Observação</label><textarea id="exc-obs" placeholder="Explique a autorização..."></textarea></div>
        </div>
        <div style="margin-top:12px;"><button class="btn btn-primary" onclick="salvarLiberacaoExcecao('${id}')">Liberar por Exceção</button></div>
      </div>`;
  }

  const _abrirAnaliseV13 = abrirAnalise;
  abrirAnalise = function(id) {
    _abrirAnaliseV13(id);
    const box = document.getElementById('analise-conteudo');
    const t = getAll().find(x => x.id === id);
    if (!box || !t) return;

    const st = getStatus(t);
    const label = box.querySelector('.status-label');
    const icon = box.querySelector('.status-icon');
    if (st.excecao && label) {
      label.textContent = 'LIBERADO POR EXCEÇÃO';
      label.className = 'status-label exception';
      if (icon) icon.className = 'status-icon exception';
    }
    box.insertAdjacentHTML('beforeend', renderExcecaoBox(id));
  };

  const _preencherResultadoPortariaV13 = preencherResultadoPortaria;
  preencherResultadoPortaria = function(found) {
    _preencherResultadoPortariaV13(found);
    const st = getStatus(found);
    if (!st.excecao) return;
    const icon = document.getElementById('r-icon');
    const label = document.getElementById('r-status-label');
    const sub = document.getElementById('r-status-sub');
    if (icon) icon.className = 'status-icon exception';
    if (label) { label.textContent = 'LIBERADO POR EXCEÇÃO'; label.className = 'status-label exception'; }
    if (sub) sub.textContent = `Autorizado por ${st.excecaoDados.aprovador} — ${st.excecaoDados.cargo}`;

    const motivosWrap = document.getElementById('r-motivos');
    const motivosList = document.getElementById('r-motivos-list');
    if (motivosWrap && motivosList) {
      motivosWrap.style.display = 'block';
      motivosList.innerHTML = `
        <li><b>Motivo da exceção:</b> ${st.excecaoDados.motivo}</li>
        <li><b>Data da liberação:</b> ${fmtData(st.excecaoDados.dataLiberacao)}</li>
        <li><b>Aprovador:</b> ${st.excecaoDados.aprovador} — ${st.excecaoDados.cargo}</li>
        ${st.excecaoDados.obs ? `<li><b>Obs:</b> ${st.excecaoDados.obs}</li>` : ''}
        ${(st.motivos || []).map(m => `<li>Pendência: ${m}</li>`).join('')}
        ${(st.avisos || []).map(a => `<li>Aviso: ${a}</li>`).join('')}`;
    }
  };

  const _atualizarStatsV13 = atualizarStats;
  atualizarStats = function() {
    const terceiros = getAll();
    const empresas = (typeof getAllEmpresas === 'function') ? getAllEmpresas() : [];
    const treinamentos = (typeof getAllTreinamentos === 'function') ? getAllTreinamentos() : [];
    const statuses = terceiros.map(t => getStatus(t));
    const liberados = statuses.filter(s => s.ok && !s.excecao && !s.pendente).length;
    const excecoes = statuses.filter(s => s.excecao).length;
    const pendentes = statuses.filter(s => s.pendente && !s.excecao).length;
    const bloqueados = statuses.filter(s => s.bloqueado && !s.excecao).length;
    const pendenciasTreino = contarTreinamentosRegistrados(terceiros);
    const empresasComExigencias = empresas.filter(e => (e.treinamentosObrigatorios || []).length > 0).length;
    const pendenciasGerais = montarPendencias().total;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-total', terceiros.length); set('stat-liberados', liberados); set('stat-bloqueados', bloqueados); set('stat-empresas', empresas.length); set('stat-pendencias-treino', pendenciasTreino);
    set('dash-total', terceiros.length); set('dash-liberados', liberados); set('dash-bloqueados', bloqueados); set('dash-empresas', empresas.length);
    set('dash-excecoes', excecoes); set('dash-pendentes', pendentes);
    set('dash-pendencias', pendenciasGerais); set('dash-treinamentos', treinamentos.length); set('dash-empresas-exigencias', empresasComExigencias);
    set('dash-status-geral', bloqueados === 0 ? (pendentes || excecoes ? 'ATENÇÃO' : 'OK') : 'ATENÇÃO');
  };

  function renderExcecoesDashboard() {
    const wrap = document.getElementById('dash-excecoes-list');
    if (!wrap) return;
    const all = getAllExcecoes();
    const itens = Object.values(all).filter(x => {
      const terceiro = x && getAll().find(t => t.id === x.terceiroId);
      return terceiro && getExcecaoTerceiro(x.terceiroId) && getStatus(terceiro).excecao;
    }).sort((a,b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
    if (!itens.length) {
      wrap.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhuma liberação por exceção ativa.</p>';
      return;
    }
    wrap.innerHTML = itens.slice(0, 20).map(ex => `
      <div class="exception-item" role="button" tabindex="0" data-terceiro-id="${ex.terceiroId}" style="cursor:pointer;">
        <div><strong>${ex.terceiro || 'Terceiro'}</strong><small>${ex.empresa || 'Empresa não informada'} • ${ex.cpf || 'CPF não informado'}</small><small>${ex.motivo} — ${fmtData(ex.dataLiberacao)}</small></div>
        <div><span class="badge badge-exception">EXCEÇÃO</span></div>
      </div>`).join('');
  }

  const _renderDashboardV13 = renderDashboard;
  renderDashboard = function() {
    _renderDashboardV13();
    renderExcecoesDashboard();
  };

  document.addEventListener('click', function(e) {
    const item = e.target.closest('.exception-item[data-terceiro-id]');
    if (!item) return;
    const id = item.getAttribute('data-terceiro-id');
    if (id) abrirAnalise(id);
  });

  // ──────────────────────────────────────────────────
  //  V13.1 — Cards verticais + exceção com data até
  // ──────────────────────────────────────────────────
  (function configurarV131(){
    const css = document.createElement('style');
    css.textContent = `
      .terceiro-card-row td { padding: 10px 0 !important; background: transparent !important; }
      .terceiro-card { border: 1px solid var(--border); border-radius: 18px; background: #fff; padding: 16px; cursor: pointer; display: grid; gap: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.04); }
      .terceiro-card:hover { border-color: var(--accent); box-shadow: 0 6px 18px rgba(21,94,239,.10); }
      .terceiro-card-top { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
      .terceiro-card-name { font-size: 17px; font-weight: 800; color: var(--text); line-height: 1.15; }
      .terceiro-card-meta { color: var(--muted); font-size: 13px; margin-top:4px; line-height:1.35; }
      .terceiro-card-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .terceiro-card-info { background: var(--bg-soft, #F8FAFC); border:1px solid var(--border); border-radius:12px; padding:10px; }
      .terceiro-card-info label { font-size: 11px; text-transform: uppercase; letter-spacing:.5px; color:var(--muted); font-weight:700; margin:0 0 4px; }
      .terceiro-card-info div { font-size: 14px; color:var(--text); font-weight:600; }
      .terceiro-card-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .terceiro-card-hint { margin-left:auto; font-size:12px; color:var(--muted); }
      .exception-validity { background:#FEF3C7; border:1px solid #FBBF24; color:#92400E; border-radius:10px; padding:8px 10px; margin-top:8px; font-size:13px; }
      @media (max-width: 680px) {
        #page-listagem table thead { display:none; }
        #page-listagem table, #page-listagem tbody, #page-listagem tr, #page-listagem td { display:block; width:100%; }
        .terceiro-card-grid { grid-template-columns: 1fr; }
        .terceiro-card-top { flex-direction:column; }
        .terceiro-card-hint { margin-left:0; }
      }
    `;
    document.head.appendChild(css);
  })();

  function escapeHtmlSafeV131(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  // Exceção só libera quando está ativa e ainda está dentro da data "até".
  getExcecaoTerceiro = function(id) {
    const all = getAllExcecoes();
    const ex = all[id];
    if (!ex || !ex.ativo) return null;
    if (ex.dataAte && ex.dataAte < hoje()) return null;
    return ex;
  };

  salvarLiberacaoExcecao = async function(id) {
    const t = getAll().find(x => x.id === id);
    if (!t) return;

    const dataLiberacao = document.getElementById('exc-data')?.value || '';
    const dataAte = document.getElementById('exc-data-ate')?.value || '';
    const aprovador = document.getElementById('exc-aprovador')?.value.trim() || '';
    const cargo = document.getElementById('exc-cargo')?.value || '';
    const motivo = document.getElementById('exc-motivo')?.value || '';
    const obs = document.getElementById('exc-obs')?.value.trim() || '';

    if (!dataLiberacao || !dataAte || !aprovador || !cargo || !motivo) {
      toast('⚠ Preencha data da liberação, liberado até, aprovador, cargo e motivo.');
      return;
    }
    if (dataLiberacao < hoje()) {
      toast('⚠ A data da liberação não pode ser retroativa.');
      return;
    }
    if (dataAte < hoje()) {
      toast('⚠ A data "liberado até" não pode ser retroativa.');
      return;
    }
    if (dataAte < dataLiberacao) {
      toast('⚠ A data "liberado até" não pode ser menor que a data da liberação.');
      return;
    }

    const all = { ...getAllExcecoes() };
    all[id] = {
      id: uid(),
      terceiroId: id,
      terceiro: t.nome || '',
      empresa: t.empresa || '',
      cpf: t.cpf || '',
      ativo: true,
      dataLiberacao,
      dataAte,
      aprovador,
      cargo,
      motivo,
      obs,
      criadoEm: new Date().toISOString()
    };
    try { await window.tssExceptionStore.save(id, all[id]); }
    catch(e) { toast('⚠ A exceção não foi salva no banco.'); return; }
    registrarHistorico('terceiro', id, `Liberação por exceção registrada por ${aprovador} (${cargo}). Motivo: ${motivo}. De ${fmtData(dataLiberacao)} até ${fmtData(dataAte)}.`);
    toast('✓ Liberação por exceção registrada.');
    abrirAnalise(id);
    renderDashboard();
    if (document.getElementById('page-listagem')?.classList.contains('active')) renderLista();
  };

  renderExcecaoBox = function(id) {
    const ex = getExcecaoTerceiro(id);
    if (ex) {
      return `
        <div class="exception-box">
          <strong>🟡 Liberado por Exceção</strong>
          <div class="exception-active">
            <b>Data da liberação:</b> ${fmtData(ex.dataLiberacao)}<br>
            <b>Liberado até:</b> ${ex.dataAte ? fmtData(ex.dataAte) : 'Não informado'}<br>
            <b>Aprovador:</b> ${escapeHtmlSafeV131(ex.aprovador)}<br>
            <b>Cargo:</b> ${escapeHtmlSafeV131(ex.cargo)}<br>
            <b>Motivo:</b> ${escapeHtmlSafeV131(ex.motivo)}<br>
            ${ex.obs ? `<b>Observação:</b> ${escapeHtmlSafeV131(ex.obs)}<br>` : ''}
            <small>Registrado em ${new Date(ex.criadoEm).toLocaleString('pt-BR')}</small>
          </div>
          <div style="margin-top:10px;"><button class="btn btn-danger" onclick="cancelarLiberacaoExcecao('${id}')">Cancelar exceção</button></div>
        </div>`;
    }
    return `
      <div class="exception-box">
        <strong>Liberação por Exceção</strong>
        <p style="font-size:13px;color:#92400E;margin-top:6px;">Use somente quando houver autorização formal para entrada mesmo com pendências. As datas não podem ser retroativas.</p>
        <div class="exception-grid">
          <div><label>Data da liberação *</label><input id="exc-data" type="date" min="${hoje()}" value="${hoje()}"></div>
          <div><label>Liberado até *</label><input id="exc-data-ate" type="date" min="${hoje()}" value="${hoje()}"></div>
          <div><label>Cargo do aprovador *</label><select id="exc-cargo"><option value="">Selecione...</option><option>Gerente da Planta</option><option>Supervisor Industrial</option><option>Coordenador Industrial</option><option>Outro</option></select></div>
          <div><label>Motivo *</label><select id="exc-motivo"><option value="">Selecione...</option><option>ASO pendente</option><option>Integração pendente</option><option>Documento DP pendente</option><option>Emergência operacional</option><option>Outro</option></select></div>
          <div class="full"><label>Nome do aprovador *</label><input id="exc-aprovador" placeholder="Ex.: João da Silva"></div>
          <div class="full"><label>Observação</label><textarea id="exc-obs" placeholder="Explique a autorização..."></textarea></div>
        </div>
        <div class="exception-validity"><b>Regra:</b> o terceiro ficará como liberado por exceção somente até a data informada acima.</div>
        <div style="margin-top:12px;"><button class="btn btn-primary" onclick="salvarLiberacaoExcecao('${id}')">Liberar por Exceção</button></div>
      </div>`;
  };

  // Listagem em cards verticais clicáveis, própria para celular.
  renderLista = function() {
    atualizarStats();
    const buscaEl = document.getElementById('busca-lista');
    const filtroEl = document.getElementById('filtro-empresa-lista');
    const q = (buscaEl?.value || '').toLowerCase().trim();
    const empresaFiltro = filtroEl?.value || '';
    let lista = getAll();

    if (q) lista = lista.filter(t => correspondeBuscaTerceiroSST(q, t));
    if (empresaFiltro) lista = lista.filter(t => t.empresaId === empresaFiltro || t.empresa === empresaFiltro);

    const tbody = document.getElementById('tabela-body');
    const empty = document.getElementById('lista-empty');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!lista.length) {
      if (empty) empty.style.display = 'block';
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

  // Reforço: cards antigos também abrem a ficha.
  document.addEventListener('click', function(e) {
    const card = e.target.closest('[data-terceiro-id]');
    if (!card) return;
    const id = card.getAttribute('data-terceiro-id');
    if (id && !e.target.closest('button, a, input, select, textarea')) abrirAnalise(id);
  });

  // Portaria mostra também "liberado até" quando houver exceção.
  const _preencherResultadoPortariaV131 = preencherResultadoPortaria;
  preencherResultadoPortaria = function(found) {
    _preencherResultadoPortariaV131(found);
    const st = getStatus(found);
    if (!st.excecao) return;
    const motivosList = document.getElementById('r-motivos-list');
    if (motivosList && st.excecaoDados?.dataAte) {
      motivosList.insertAdjacentHTML('afterbegin', `<li><b>Liberado até:</b> ${fmtData(st.excecaoDados.dataAte)}</li>`);
    }
  };

  // Dashboard de exceções considera somente exceções ainda válidas.
  renderExcecoesDashboard = function() {
    const wrap = document.getElementById('dash-excecoes-list');
    if (!wrap) return;
    const all = getAllExcecoes();
    const itens = Object.values(all).filter(x => x && x.ativo && (!x.dataAte || x.dataAte >= hoje())).sort((a,b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
    if (!itens.length) {
      wrap.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhuma liberação por exceção ativa.</p>';
      return;
    }
    wrap.innerHTML = itens.slice(0, 20).map(ex => `
      <div class="exception-item" role="button" tabindex="0" data-terceiro-id="${ex.terceiroId}" style="cursor:pointer;">
        <div><strong>${escapeHtmlSafeV131(ex.terceiro || 'Terceiro')}</strong><small>${escapeHtmlSafeV131(ex.empresa || 'Empresa não informada')} • ${escapeHtmlSafeV131(ex.cpf || 'CPF não informado')}</small><small>${escapeHtmlSafeV131(ex.motivo)} — ${fmtData(ex.dataLiberacao)} até ${ex.dataAte ? fmtData(ex.dataAte) : 'sem data final'}</small></div>
        <div><span class="badge badge-exception">EXCEÇÃO</span></div>
      </div>`).join('');
  };

  if (document.getElementById('page-listagem')?.classList.contains('active')) renderLista();


  // ──────────────────────────────────────────────────
  //  V16 — Upload de documentos + Dashboard inteligente
  // ──────────────────────────────────────────────────
