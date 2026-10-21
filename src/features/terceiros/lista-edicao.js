  function renderLista() {
    atualizarStats();
    const q = document.getElementById('busca-lista').value.toLowerCase().trim();
    let lista = getAll();
    if (q) lista = lista.filter(t => correspondeBuscaTerceiroSST(q, t));

    const tbody = document.getElementById('tabela-body');
    const empty = document.getElementById('lista-empty');
    tbody.innerHTML = '';

    if (!lista.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    lista.forEach(t => {
      const { ok, motivos } = getStatus(t);
      const badge = ok
        ? `<span class="badge badge-ok">✓ Liberado</span>`
        : `<span class="badge badge-blocked">✕ Bloqueado</span>`;
      const h = hoje();
      const asoTag  = t.aso  < h ? `<span class="tag-venc">VENCIDO</span>` : `<span class="tag-ok">OK</span>`;
      const integTag= t.integ< h ? `<span class="tag-venc">VENCIDO</span>` : `<span class="tag-ok">OK</span>`;
      const obrig = getTreinosObrigatoriosDaEmpresa(t.empresaId);
      const pend = obrig.filter(tr => !getStatusTreinamentoTerceiro(t, tr).ok).length;
      const treinoBadge = badgeTreinamentosComplementares(t);
      const stDP = getStatusDP(t);
      const stSESMT = getStatusSESMT(t);
      const dpBadge = stDP.ok ? '<span class="badge badge-ok">DP OK</span>' : '<span class="badge badge-blocked">DP Bloq.</span>';
      const sesmtBadge = stSESMT.ok ? '<span class="badge badge-ok">SESMT OK</span>' : '<span class="badge badge-blocked">SESMT Bloq.</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-name">${escapeHtmlSafeV131(t.nome)}</td>
        <td class="td-cpf">${escapeHtmlSafeV131(t.cpf)}</td>
        <td class="td-company">${t.empresa}</td>
        <td>${fmtData(t.aso)}${asoTag}</td>
        <td>${fmtData(t.integ)}${integTag}</td>
        <td>${treinoBadge}</td>
        <td>${dpBadge}</td>
        <td>${sesmtBadge}</td>
        <td>${badge}</td>
        <td>
          <div class="actions">
            <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px;" onclick="abrirAnalise('${t.id}')">Analisar</button>
            <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px;" onclick="abrirEdicao('${t.id}')">Editar</button>
            <button class="btn btn-danger" style="padding:5px 12px;font-size:12px;" onclick="excluir('${t.id}')">Excluir</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  function excluir(id) {
    if (!confirm('Deseja excluir este terceiro?')) return;
    saveAll(getAll().filter(t => t.id !== id));
    renderLista();
    toast('Terceiro removido.');
  }

  // ──────────────────────────────────────────────────
  //  EDIÇÃO
  // ──────────────────────────────────────────────────
  function abrirEdicao(id) {
    const t = getAll().find(t => t.id === id);
    if (!t) return;
    popularSelectEmpresas('e-empresa', t.empresaId || '');
    document.getElementById('e-id').value     = t.id;
    document.getElementById('e-nome').value   = t.nome;
    document.getElementById('e-cpf').value    = t.cpf;
    if (!t.empresaId && t.empresa) {
      const sel = document.getElementById('e-empresa');
      const opt = Array.from(sel.options).find(o => o.textContent === t.empresa);
      if (opt) sel.value = opt.value;
    }
    document.getElementById('e-funcao').value = t.funcao;
    document.getElementById('e-aso').value    = t.aso;
    document.getElementById('e-integ').value  = t.integ;
    document.getElementById('e-obs').value    = t.obs;
    renderTreinosEdicao(t);
    document.getElementById('modal').classList.add('open');
  }

  function fecharModal() {
    document.getElementById('modal').classList.remove('open');
  }

  function renderTreinosEdicao(terceiro) {
    const sel = document.getElementById('e-empresa');
    const empresaId = sel ? sel.value : '';
    const realizados = terceiro?.treinamentosRealizados || [];
    renderCamposTreinamentos('e-treinos-box', empresaId, realizados, 'e-treino-data');
  }

  function salvarEdicao() {
    const id     = document.getElementById('e-id').value;
    const nome   = document.getElementById('e-nome').value.trim();
    const cpf    = document.getElementById('e-cpf').value.trim();
    const empSel = document.getElementById('e-empresa');
    const empresaId = empSel.value;
    const empresa = empSel.options[empSel.selectedIndex]?.text || '';
    const funcao = document.getElementById('e-funcao').value.trim();
    const aso    = document.getElementById('e-aso').value;
    const integ  = document.getElementById('e-integ').value;
    const obs    = document.getElementById('e-obs').value.trim();
    const treinamentosRealizados = coletarTreinamentosDoFormulario('e');

    if (!nome || !cpf || !empresaId || !funcao || !aso || !integ) {
      toast('⚠ Preencha todos os campos obrigatórios.'); return;
    }

    const lista = getAll().map(t => t.id === id ? { ...t, nome, cpf, empresaId, empresa, funcao, aso, integ, obs, treinamentosRealizados } : t);
    saveAll(lista);
    fecharModal();
    renderLista();
    toast('✓ Alterações salvas!');
  }

  // fechar modal ao clicar fora
  document.getElementById('modal').addEventListener('click', function(e) {
    if (e.target === this) fecharModal();
  });



  // ──────────────────────────────────────────────────
  //  TREINAMENTOS — CATÁLOGO PADRÃO
  // ──────────────────────────────────────────────────
