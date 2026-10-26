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
  //  CPF / FORM VALIDATION
  // ──────────────────────────────────────────────────
  function validarCPFSST(value) {
    const cpf = String(value || '').replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const calc = tamanho => {
      let soma = 0;
      for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
  }

  function cpfJaCadastradoSST(cpf, ignorarId) {
    const alvo = String(cpf || '').replace(/\D/g, '');
    return getAll().some(t => t.id !== ignorarId && String(t.cpf || '').replace(/\D/g, '') === alvo);
  }

  function validarCadastroTerceiroSST({ nome, cpf, empresaId, funcao, aso, integ, ignorarId }) {
    if (!nome || !cpf || !empresaId || !funcao || !aso || !integ) {
      return 'Preencha todos os campos obrigatórios.';
    }
    if (!validarCPFSST(cpf)) return 'Informe um CPF válido.';
    if (cpfJaCadastradoSST(cpf, ignorarId)) return 'Já existe um terceiro com este CPF.';
    if (!isDataValidaSistema(aso)) return 'Informe uma data válida para o ASO.';
    if (!isDataValidaSistema(integ)) return 'Informe uma data válida para a integração.';
    return '';
  }

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

    const erro = validarCadastroTerceiroSST({ nome, cpf, empresaId, funcao, aso, integ });
    if (erro) {
      toast('⚠ ' + erro);
      return;
    }

    const lista = getAll();
    lista.push({ id: uid(), nome, cpf: maskCPF(cpf), empresaId, empresa, funcao, aso, integ, obs, treinamentosRealizados });
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

