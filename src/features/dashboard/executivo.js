  function contarTreinamentosRegistrados(terceiros) {
    return terceiros.reduce((total, t) => total + (t.treinamentosRealizados || []).filter(reg =>
      isDataValidaSistema(reg.data) && getTreinamentoById(reg.treinamentoId)).length, 0);
  }
  function escapeTrainingText(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function badgeTreinamentosComplementares(t) {
    const total = contarTreinamentosRegistrados([t]);
    return '<span class="badge">' + (total ? total + ' treinamento(s) registrado(s)' : 'Sem treinamentos adicionais') + '</span>';
  }

  function getResumoExecutivo() {
    const terceiros = getAll();
    const empresas = getAllEmpresas();
    const hojeIso = hoje();
    const asoVencidos = terceiros.filter(t => isDataValidaSistema(t.aso) && t.aso < hojeIso).length;
    const integVencidas = terceiros.filter(t => isDataValidaSistema(t.integ) && t.integ < hojeIso).length;
    const treinosPendentes = contarTreinamentosRegistrados(terceiros);
    const contratosVencidos = empresas.filter(e => isDataValidaSistema(e.contratoFim) && e.contratoFim < hojeIso).length;
    return { asoVencidos, integVencidas, treinosPendentes, contratosVencidos };
  }

  function renderListaAcoes() {
    const wrap = document.getElementById('dash-lista-acoes');
    if (!wrap) return;
    const r = getResumoExecutivo();
    const itens = [
      { titulo:'ASOs vencidos', qtd:r.asoVencidos, desc:'Terceiros com ASO fora da validade.', acao:"showPage('pendencias')" },
      { titulo:'Integrações vencidas', qtd:r.integVencidas, desc:'Terceiros com integração fora da validade.', acao:"showPage('pendencias')" },
      { titulo:'Contratos de empresa vencidos', qtd:r.contratosVencidos, desc:'Empresas com fim de prestação vencido.', acao:"showPage('empresas')" }
    ].filter(i => i.qtd > 0);
    wrap.innerHTML = itens.length ? itens.map(i => `<div class="quick-action" onclick="${i.acao}"><div><strong>${i.titulo}</strong><small>${i.desc}</small></div><span class="badge badge-blocked">${i.qtd}</span></div>`).join('') : '<p style="font-size:14px;color:var(--muted);">Nenhuma ação urgente no momento.</p>';
  }

  const _atualizarStatsBase = atualizarStats;
  atualizarStats = function() {
    _atualizarStatsBase();
    const r = getResumoExecutivo();
    const set = (id,val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('exec-aso-vencidos', r.asoVencidos);
    set('exec-integ-vencidas', r.integVencidas);
    set('exec-treinos-pendentes', r.treinosPendentes);
    set('exec-contratos-vencidos', r.contratosVencidos);
    renderListaAcoes();
  };

  const _renderListaBase = renderLista;
  renderLista = function() {
    preencherFiltroEmpresas();
    const filtro = document.getElementById('filtro-empresa-lista')?.value || '';
    _renderListaBase();
    if (!filtro) return;
    const tbody = document.getElementById('tabela-body');
    if (!tbody) return;
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const nome = tr.querySelector('.td-name')?.textContent || '';
      const cpf = tr.querySelector('.td-cpf')?.textContent || '';
      const t = getAll().find(x => x.nome === nome && x.cpf === cpf);
      if (t && t.empresaId !== filtro) tr.remove();
    });
    const empty = document.getElementById('lista-empty');
    if (empty && tbody.children.length === 0) empty.style.display = 'block';
  };

  const _montarPendenciasBase = montarPendencias;
  montarPendencias = function() {
    const dados = _montarPendenciasBase();
    ['vencidas','proximas','semData'].forEach(k => dados[k].forEach(p => {
      if (!p.terceiroId) {
        const t = getAll().find(x => (x.nome || '') === (p.terceiro || '') && (x.cpf || '') === (p.cpf || ''));
        if (t) p.terceiroId = t.id;
      }
    }));
    return dados;
  };

  const _renderPendenciaItemBase = renderPendenciaItem;
  renderPendenciaItem = function(p, classe) {
    const html = _renderPendenciaItemBase(p, classe);
    return html.replace('<div class="pendency-item">', `<div class="pendency-item" onclick="${p.terceiroId ? `abrirAnalise('${p.terceiroId}')` : ''}">`);
  };

  const _renderDashboardBase = renderDashboard;
  renderDashboard = function() {
    _renderDashboardBase();
    const wrap = document.getElementById('dash-lista-bloqueados');
    if (!wrap) return;
    const items = wrap.querySelectorAll('.dash-item');
    const bloqueados = getAll().map(t => ({...t, status:getStatus(t)})).filter(t => !t.status.ok);
    items.forEach((el, idx) => { if (bloqueados[idx]) el.setAttribute('onclick', `abrirAnalise('${bloqueados[idx].id}')`); });
  };

  function copiarTexto(texto) {
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(() => toast('Texto copiado.'));
    else { prompt('Copie o texto:', texto); }
  }

  function gerarTextoEmailTerceiro(id) {
    const t = getAll().find(x => x.id === id);
    if (!t) return '';
    const st = getStatus(t);
    return `Bom dia,\n\nSegue pendência de acesso de terceiro:\n\nTerceiro: ${t.nome}\nEmpresa: ${t.empresa || 'Não informada'}\nCPF: ${t.cpf || 'Não informado'}\nStatus: ${st.ok ? 'LIBERADO' : 'BLOQUEADO'}\n\nMotivos/Pendências:\n- ${st.motivos.length ? st.motivos.join('\n- ') : 'Sem pendências'}\n\nGentileza regularizar para atualização do controle de acesso.\n\nAtt.`;
  }

  const _abrirAnaliseBase = abrirAnalise;
  abrirAnalise = function(id) {
    _abrirAnaliseBase(id);
    const t = getAll().find(x => x.id === id);
    const box = document.getElementById('analise-conteudo');
    if (!t || !box) return;
    const historico = getHistorico('terceiro', id);
    const anexos = getAnexosTerceiro(id);
    const extra = `
      <div class="analysis-section">
        <strong>Atalhos</strong>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button class="btn btn-primary" onclick="copiarTexto(gerarTextoEmailTerceiro('${id}'))">Copiar e-mail de pendência</button>
          <button class="btn btn-ghost" onclick="abrirEdicao('${id}')">Editar cadastro</button>
        </div>
      </div>
      <div class="analysis-section">
        <strong>Anexos / documentos registrados</strong>
        <div class="attachment-form">
          <select id="anexo-tipo"><option>ASO</option><option>Integração</option><option>Treinamento</option><option>Ficha EPI</option><option>Contrato/Ficha Registro</option><option>CNH</option><option>Outro</option></select>
          <input id="anexo-nome" placeholder="Ex.: ASO_Pablo_2026.pdf">
          <button class="btn btn-primary" onclick="adicionarAnexoTerceiro('${id}')">Adicionar</button>
        </div>
        <div class="attachment-list">${anexos.length ? anexos.map(a => `<div class="attachment-item"><strong>${a.tipo}</strong> — ${a.nome}<br><small>${new Date(a.data).toLocaleString('pt-BR')}</small> <button class="btn btn-danger" style="padding:4px 8px;font-size:11px;margin-left:6px;" onclick="removerAnexoTerceiro('${id}','${a.id}')">Remover</button></div>`).join('') : '<p style="font-size:13px;color:var(--muted);margin-top:8px;">Nenhum anexo registrado ainda.</p>'}</div>
      </div>
      <div class="analysis-section">
        <strong>Histórico de alterações</strong>
        <div class="history-list">${historico.length ? historico.slice(0,10).map(h => `<div class="history-item"><strong>${new Date(h.data).toLocaleString('pt-BR')}</strong><br>${escapeHtmlSafeV131(h.descricao)}</div>`).join('') : '<p style="font-size:13px;color:var(--muted);margin-top:8px;">Sem histórico registrado para este terceiro.</p>'}</div>
      </div>`;
    box.insertAdjacentHTML('beforeend', extra);
  };


  // ──────────────────────────────────────────────────
  //  V11 — Inteligência, ranking e relatório executivo
  // ──────────────────────────────────────────────────
