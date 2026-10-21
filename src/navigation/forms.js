  function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('nav button').forEach((b, i) => {
      const pages = ['dashboard','cadastro','listagem','empresas','treinamentos','dados','portaria'];
      b.classList.toggle('active', pages[i] === name);
    });
    document.getElementById('page-' + name).classList.add('active');
    if (name === 'dashboard') renderDashboard();
    if (name === 'pendencias') renderPendencias();
    if (name === 'listagem') renderLista();
    if (name === 'empresas') renderEmpresas();
    if (name === 'treinamentos') renderTreinamentos();
    if (name === 'dados') renderDados();
    if (name === 'cadastro') { popularSelectEmpresas('f-empresa'); renderTreinosExigidosCadastro(); }
  }

  // ──────────────────────────────────────────────────
  //  CPF MASK
  // ──────────────────────────────────────────────────
  document.getElementById('f-cpf').addEventListener('input', function() {
    this.value = maskCPF(this.value);
  });
  document.getElementById('e-cpf').addEventListener('input', function() {
    this.value = maskCPF(this.value);
  });
  document.getElementById('f-empresa').addEventListener('change', renderTreinosExigidosCadastro);
  document.getElementById('e-empresa').addEventListener('change', function(){ renderTreinosEdicao(); });



  function coletarTreinamentosDoFormulario(prefixo) {
    return Array.from(document.querySelectorAll(`.${prefixo}-treino-data`))
      .map(input => ({ treinamentoId: input.dataset.treinamentoId, data: input.value }))
      .filter(x => x.treinamentoId && x.data);
  }

  function renderCamposTreinamentos(containerId, empresaId, realizados, classeInput) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    const obrigatorios = getTreinosObrigatoriosDaEmpresa(empresaId);
    realizados = realizados || [];

    if (!empresaId) {
      wrap.innerHTML = '<p style="font-size:13px;color:var(--muted);">Selecione uma empresa para visualizar os treinamentos adicionais.</p>';
      return;
    }

    if (!obrigatorios.length) {
      wrap.innerHTML = '<p style="font-size:13px;color:var(--muted);">Esta empresa não possui treinamentos adicionais vinculados.</p>';
      return;
    }

    wrap.innerHTML = obrigatorios.map(tr => {
      const reg = realizados.find(x => x.treinamentoId === tr.id) || {};
      const venc = reg.data ? addMonths(reg.data, tr.validade || 12) : '';
      const status = '<span class="status-mini">' + (reg.data ? 'Registrado' : 'Opcional') + '</span>';
      return `
        <div class="training-date-card">
          <strong>${tr.nome} ${status}</strong>
          <input type="date" class="${classeInput}" data-treinamento-id="${tr.id}" value="${reg.data || ''}">
          <small>Validade: ${tr.validade || 12} meses${venc ? ' | Vence em ' + fmtData(venc) : ''}</small>
        </div>`;
    }).join('');
  }

  // ──────────────────────────────────────────────────
  //  CADASTRO
  // ──────────────────────────────────────────────────
  function salvarTerceiro() {
    const nome   = document.getElementById('f-nome').value.trim();
    const cpf    = document.getElementById('f-cpf').value.trim();
    const empSel = document.getElementById('f-empresa');
    const empresaId = empSel.value;
    const empresa = empSel.options[empSel.selectedIndex]?.text || '';
    const funcao = document.getElementById('f-funcao').value.trim();
    const aso    = document.getElementById('f-aso').value;
    const integ  = document.getElementById('f-integ').value;
    const obs    = document.getElementById('f-obs').value.trim();
    const treinamentosRealizados = coletarTreinamentosDoFormulario('f');

    if (!nome || !cpf || !empresaId || !funcao || !aso || !integ) {
      toast('⚠ Preencha todos os campos obrigatórios.');
      return;
    }

    const lista = getAll();
    const cpfLimpo = cpf.replace(/\D/g, '');
    const duplicado = lista.find(t => t.cpf.replace(/\D/g, '') === cpfLimpo);
    if (duplicado) {
      toast('⚠ Já existe um terceiro com este CPF.');
      return;
    }

    lista.push({ id: uid(), nome, cpf, empresaId, empresa, funcao, aso, integ, obs, treinamentosRealizados });
    saveAll(lista);
    limparForm();
    toast('✓ Terceiro cadastrado com sucesso!');
  }

  function limparForm() {
    ['f-nome','f-cpf','f-empresa','f-funcao','f-aso','f-integ','f-obs'].forEach(id => {
      document.getElementById(id).value = '';
    });
    renderTreinosExigidosCadastro();
  }

