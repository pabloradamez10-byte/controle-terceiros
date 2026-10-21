  function getAllEmpresas() {
    return JSON.parse(localStorage.getItem('empresas') || '[]');
  }

  function saveAllEmpresas(data) {
    localStorage.setItem('empresas', JSON.stringify(data));
  }

  function popularSelectEmpresas(selectId, selectedId) {
    const sel = document.getElementById(selectId || 'f-empresa');
    if (!sel) return;
    const empresas = getAllEmpresas();
    sel.innerHTML = '<option value="">Selecione uma empresa...</option>';
    empresas.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.fantasia ? `${e.razao} (${e.fantasia})` : e.razao;
      if (selectedId && e.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function maskCNPJ(v) {
    v = v.replace(/\D/g, '').slice(0, 14);
    if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})$/, '$1.$2.$3/$4-$5');
    else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{1,4})$/, '$1.$2.$3/$4');
    else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{1,3})$/, '$1.$2.$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{1,3})$/, '$1.$2');
    return v;
  }

  function maskTel(v) {
    v = v.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
    return v;
  }

  document.getElementById('emp-cnpj').addEventListener('input', function() { this.value = maskCNPJ(this.value); });
  document.getElementById('emp-tel').addEventListener('input',  function() { this.value = maskTel(this.value); });

  function abrirModalNovaEmpresa() {
    document.getElementById('modal-empresa-title').textContent = 'Nova Empresa';
    document.getElementById('emp-id').value = '';
    ['emp-razao','emp-fantasia','emp-cnpj','emp-resp','emp-tel','emp-email','emp-contrato-inicio','emp-contrato-fim','emp-doc-dp','emp-doc-sesmt'].forEach(id => {
      document.getElementById(id).value = '';
    });
    renderChecklistTreinamentosEmpresa([]);
    document.getElementById('modal-empresa').classList.add('open');
  }

  function abrirModalEditarEmpresa(id) {
    const e = getAllEmpresas().find(e => e.id === id);
    if (!e) return;
    document.getElementById('modal-empresa-title').textContent = 'Editar Empresa';
    document.getElementById('emp-id').value       = e.id;
    document.getElementById('emp-razao').value    = e.razao;
    document.getElementById('emp-fantasia').value = e.fantasia || '';
    document.getElementById('emp-cnpj').value     = e.cnpj;
    document.getElementById('emp-resp').value     = e.resp;
    document.getElementById('emp-tel').value      = e.tel || '';
    document.getElementById('emp-email').value    = e.email || '';
    document.getElementById('emp-contrato-inicio').value = e.contratoInicio || '';
    document.getElementById('emp-contrato-fim').value    = e.contratoFim || '';
    document.getElementById('emp-doc-dp').value          = e.docDPValidade || '';
    document.getElementById('emp-doc-sesmt').value       = e.docSESMTValidade || '';
    renderChecklistTreinamentosEmpresa(e.treinamentosObrigatorios || []);
    document.getElementById('modal-empresa').classList.add('open');
  }

  function fecharModalEmpresa() {
    document.getElementById('modal-empresa').classList.remove('open');
  }

  document.getElementById('modal-empresa').addEventListener('click', function(e) {
    if (e.target === this) fecharModalEmpresa();
  });

  function salvarEmpresa() {
    const id       = document.getElementById('emp-id').value;
    const razao    = document.getElementById('emp-razao').value.trim();
    const fantasia = document.getElementById('emp-fantasia').value.trim();
    const cnpj     = document.getElementById('emp-cnpj').value.trim();
    const resp     = document.getElementById('emp-resp').value.trim();
    const tel      = document.getElementById('emp-tel').value.trim();
    const email    = document.getElementById('emp-email').value.trim();
    const contratoInicio = document.getElementById('emp-contrato-inicio').value;
    const contratoFim    = document.getElementById('emp-contrato-fim').value;
    const docDPValidade  = document.getElementById('emp-doc-dp').value;
    const docSESMTValidade = document.getElementById('emp-doc-sesmt').value;
    const treinamentosObrigatorios = getTreinamentosSelecionadosEmpresa();

    if (!razao || !cnpj || !resp) {
      toast('⚠ Preencha Razão Social, CNPJ e Responsável.');
      return;
    }

    let lista = getAllEmpresas();

    if (id) {
      lista = lista.map(e => e.id === id ? { ...e, razao, fantasia, cnpj, resp, tel, email, contratoInicio, contratoFim, docDPValidade, docSESMTValidade, treinamentosObrigatorios } : e);
      const terceiros = getAll().map(t => t.empresaId === id ? { ...t, empresa: fantasia ? `${razao} (${fantasia})` : razao } : t);
      saveAll(terceiros);
      toast('✓ Empresa atualizada!');
    } else {
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      if (lista.find(e => e.cnpj.replace(/\D/g, '') === cnpjLimpo)) {
        toast('⚠ Já existe uma empresa com este CNPJ.');
        return;
      }
      lista.push({ id: uid(), razao, fantasia, cnpj, resp, tel, email, contratoInicio, contratoFim, docDPValidade, docSESMTValidade, treinamentosObrigatorios });
      toast('✓ Empresa cadastrada!');
    }

    saveAllEmpresas(lista);
    fecharModalEmpresa();
    renderEmpresas();
    popularSelectEmpresas('f-empresa');
    popularSelectEmpresas('e-empresa');
    atualizarStats();
  }

  function renderListaMotivos(titulo, status) {
    const itens = status.motivos.length ? status.motivos : (status.avisos.length ? status.avisos : ['Sem pendências']);
    const classe = status.ok ? 'ok' : 'blocked';
    return `<div class="analysis-card">
      <strong>${titulo} ${status.ok ? '<span class="badge badge-ok">LIBERADO</span>' : '<span class="badge badge-blocked">NEGADO</span>'}</strong>
      <ul class="analysis-list">${itens.map(i => `<li>${i}</li>`).join('')}</ul>
    </div>`;
  }

  function abrirAnalise(id) {
    const t = getAll().find(x => x.id === id);
    if (!t) return;
    const empresa = getEmpresaById(t.empresaId);
    const st = getStatus(t);
    const obrig = getTreinosObrigatoriosDaEmpresa(t.empresaId);
    const treinosHtml = obrig.length ? obrig.map(tr => {
      const ts = getStatusTreinamentoTerceiro(t, tr);
      const reg = getTreinoRealizado(t, tr.id);
      return `<li>${reg?.data ? '•' : '—'} ${tr.nome} — ${reg?.data ? 'Realizado em ' + fmtData(reg.data) + ' | vence em ' + fmtData(ts.vencimento) : 'Sem data cadastrada'}</li>`;
    }).join('') : '<li>Empresa sem treinamentos adicionais vinculados.</li>';

    document.getElementById('analise-conteudo').innerHTML = `
      <div class="result-status">
        <div class="status-icon ${st.ok ? 'ok' : 'blocked'}"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${st.ok ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'}</svg></div>
        <div><div class="status-label ${st.ok ? 'ok' : 'blocked'}">${st.ok ? 'ACESSO LIBERADO' : 'ACESSO NEGADO'}</div><div class="status-sub">${escapeHtmlSafeV131(t.nome)} • ${escapeHtmlSafeV131(t.empresa || 'Sem empresa')}</div></div>
      </div>
      <div class="result-info">
        <div class="info-item"><label>CPF</label><span>${escapeHtmlSafeV131(t.cpf)}</span></div>
        <div class="info-item"><label>Função</label><span>${escapeHtmlSafeV131(t.funcao || '—')}</span></div>
        <div class="info-item"><label>Contrato Empresa</label><span>${empresa?.contratoFim ? fmtData(empresa.contratoFim) + ' ' + tagData(empresa.contratoFim) : 'Não informado'}</span></div>
        <div class="info-item"><label>ASO</label><span>${fmtData(t.aso)} ${tagData(t.aso)}</span></div>
      </div>
      <div class="analysis-grid" style="margin-top:16px;">
        ${renderListaMotivos('DP', st.dp)}
        ${renderListaMotivos('SESMT', st.sesmt)}
      </div>
      <div class="analysis-card" style="margin-top:14px;">
        <strong>Treinamentos adicionais</strong>
        <ul class="analysis-list">${treinosHtml}</ul>
      </div>
    `;
    document.getElementById('modal-analise').classList.add('open');
  }


  // Alias para botões da Portaria Express e cards novos abrirem a ficha/análise completa
  function abrirAnaliseTerceiro(id) {
    return abrirAnalise(id);
  }

  function fecharModalAnalise() {
    document.getElementById('modal-analise').classList.remove('open');
  }

  document.getElementById('modal-analise').addEventListener('click', function(e) {
    if (e.target === this) fecharModalAnalise();
  });


  // ──────────────────────────────────────────────────
  //  V10 — Gestão completa: clique nos cards, filtros, histórico, anexos e e-mail
  // ──────────────────────────────────────────────────
