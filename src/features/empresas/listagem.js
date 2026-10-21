  function renderEmpresas() {
    atualizarStats();
    const q = (document.getElementById('busca-empresas')?.value || '').toLowerCase().trim();
    let lista = getAllEmpresas();
    if (q) lista = lista.filter(e => correspondeBuscaSST(q, [e.razao, e.fantasia], [e.cnpj]));

    const tbody = document.getElementById('tabela-empresas');
    const empty = document.getElementById('empresas-empty');
    tbody.innerHTML = '';

    if (!lista.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    lista.forEach(e => {
      const contratoSt = statusData(e.contratoFim);
      const dpSt = statusData(e.docDPValidade);
      const sesmtSt = statusData(e.docSESMTValidade);
      const contratoBadge = e.contratoFim ? badgeStatus(contratoSt.label, contratoSt.classe) + '<br><small>' + fmtData(e.contratoFim) + '</small>' : '<span class="badge badge-warn">Sem data</span>';
      const dpBadge = e.docDPValidade ? badgeStatus(dpSt.label, dpSt.classe) : '<span class="badge badge-warn">Sem data</span>';
      const sesmtBadge = e.docSESMTValidade ? badgeStatus(sesmtSt.label, sesmtSt.classe) : '<span class="badge badge-warn">Sem data</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-name">${e.razao}</td>
        <td class="td-company">${e.fantasia || '—'}</td>
        <td class="td-cpf">${e.cnpj}</td>
        <td>${e.resp}</td>
        <td>${e.tel || '—'}</td>
        <td>${contratoBadge}</td>
        <td>${dpBadge}</td>
        <td>${sesmtBadge}</td>
        <td><span class="badge badge-warn">${(e.treinamentosObrigatorios || []).length} vinculado(s)</span></td>
        <td>
          <div class="actions">
            <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px;" onclick="abrirModalEditarEmpresa('${e.id}')">Editar</button>
            <button class="btn btn-danger" style="padding:5px 12px;font-size:12px;" onclick="excluirEmpresa('${e.id}')">Excluir</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  function excluirEmpresa(id) {
    const vinculados = getAll().filter(t => t.empresaId === id).length;
    if (vinculados > 0) {
      toast(`⚠ Esta empresa possui ${vinculados} terceiro(s) vinculado(s). Remova-os primeiro.`);
      return;
    }
    if (!confirm('Deseja excluir esta empresa?')) return;
    saveAllEmpresas(getAllEmpresas().filter(e => e.id !== id));
    renderEmpresas();
    inicializarTreinamentosPadrao();
  popularSelectEmpresas('f-empresa');
  renderTreinosExigidosCadastro();
    popularSelectEmpresas('e-empresa');
    toast('Empresa removida.');
  }


  inicializarTreinamentosPadrao();
  popularSelectEmpresas('f-empresa');
  renderTreinosExigidosCadastro();
  renderDashboard();

  // ──────────────────────────────────────────────────
  //  PORTARIA
  // ──────────────────────────────────────────────────
