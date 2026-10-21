  const TREINAMENTOS_PADRAO = [
    'Integração', 'Política de SST', 'Uso de EPIs', 'NR 01', 'NR 05 - CIPA', 'NR 06 - EPI',
    'NR 10 Básico', 'NR 10 SEP', 'NR 11 - Empilhadeira', 'NR 11 - Ponte Rolante',
    'NR 12 - Máquinas e Equipamentos', 'NR 13 - Caldeiras e Vasos de Pressão',
    'NR 18 - Construção Civil', 'NR 20 - Inflamáveis e Combustíveis',
    'NR 23 - Combate a Incêndio', 'NR 33 - Trabalhador Autorizado', 'NR 33 - Vigia',
    'NR 33 - Supervisor', 'NR 35 - Trabalho em Altura', 'Brigada de Incêndio',
    'Primeiros Socorros', 'Direção Defensiva', 'Operador de PTA', 'Operador de Munck',
    'Operador de Guindaste', 'Operador de Retroescavadeira', 'Operador de Escavadeira',
    'Soldagem', 'Trabalho a Quente'
  ];

  function getAllTreinamentos() {
    return JSON.parse(localStorage.getItem('treinamentos') || '[]');
  }

  function saveAllTreinamentos(data) {
    localStorage.setItem('treinamentos', JSON.stringify(data));
  }

  function inicializarTreinamentosPadrao() {
    const atuais = getAllTreinamentos();
    if (atuais.length) return;
    const padrao = TREINAMENTOS_PADRAO.map(nome => ({ id: uid(), nome, validade: 12, ativo: true }));
    saveAllTreinamentos(padrao);
  }

  function treinamentosAtivos() {
    return getAllTreinamentos().filter(t => t.ativo !== false);
  }

  function abrirModalNovoTreinamento() {
    document.getElementById('modal-treinamento-title').textContent = 'Novo Treinamento';
    document.getElementById('tr-id').value = '';
    document.getElementById('tr-nome').value = '';
    document.getElementById('tr-validade').value = 12;
    document.getElementById('tr-ativo').value = 'sim';
    document.getElementById('modal-treinamento').classList.add('open');
  }

  function abrirModalEditarTreinamento(id) {
    const t = getAllTreinamentos().find(t => t.id === id);
    if (!t) return;
    document.getElementById('modal-treinamento-title').textContent = 'Editar Treinamento';
    document.getElementById('tr-id').value = t.id;
    document.getElementById('tr-nome').value = t.nome;
    document.getElementById('tr-validade').value = t.validade || 12;
    document.getElementById('tr-ativo').value = t.ativo === false ? 'nao' : 'sim';
    document.getElementById('modal-treinamento').classList.add('open');
  }

  function fecharModalTreinamento() {
    document.getElementById('modal-treinamento').classList.remove('open');
  }

  document.getElementById('modal-treinamento').addEventListener('click', function(e) {
    if (e.target === this) fecharModalTreinamento();
  });

  function salvarTreinamento() {
    const id = document.getElementById('tr-id').value;
    const nome = document.getElementById('tr-nome').value.trim();
    const validade = parseInt(document.getElementById('tr-validade').value, 10);
    const ativo = document.getElementById('tr-ativo').value === 'sim';

    if (!nome || !validade || validade < 1) {
      toast('⚠ Informe nome e validade do treinamento.');
      return;
    }

    let lista = getAllTreinamentos();
    const nomeNorm = nome.toLowerCase();
    const duplicado = lista.find(t => t.nome.toLowerCase() === nomeNorm && t.id !== id);
    if (duplicado) {
      toast('⚠ Já existe um treinamento com este nome.');
      return;
    }

    if (id) {
      lista = lista.map(t => t.id === id ? { ...t, nome, validade, ativo } : t);
      toast('✓ Treinamento atualizado!');
    } else {
      lista.push({ id: uid(), nome, validade, ativo });
      toast('✓ Treinamento cadastrado!');
    }
    saveAllTreinamentos(lista);
    fecharModalTreinamento();
    renderTreinamentos();
    renderChecklistTreinamentosEmpresa();
    renderTreinosExigidosCadastro();
  }

  function alternarTreinamento(id) {
    const lista = getAllTreinamentos().map(t => t.id === id ? { ...t, ativo: !(t.ativo !== false) } : t);
    saveAllTreinamentos(lista);
    renderTreinamentos();
    renderChecklistTreinamentosEmpresa();
    renderTreinosExigidosCadastro();
  }

  function renderTreinamentos() {
    const q = (document.getElementById('busca-treinamentos')?.value || '').toLowerCase().trim();
    let lista = getAllTreinamentos();
    if (q) lista = lista.filter(t => t.nome.toLowerCase().includes(q));

    const tbody = document.getElementById('tabela-treinamentos');
    const empty = document.getElementById('treinamentos-empty');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!lista.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    lista.forEach(t => {
      const ativo = t.ativo !== false;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-name">${escapeHtmlSafeV131(t.nome)}</td>
        <td>${t.validade || 12} meses</td>
        <td>${ativo ? '<span class="badge badge-ok">Ativo</span>' : '<span class="badge badge-blocked">Inativo</span>'}</td>
        <td>
          <div class="actions">
            <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px;" onclick="abrirModalEditarTreinamento('${t.id}')">Editar</button>
            <button class="btn ${ativo ? 'btn-danger' : 'btn-ghost'}" style="padding:5px 12px;font-size:12px;" onclick="alternarTreinamento('${t.id}')">${ativo ? 'Desativar' : 'Ativar'}</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  function renderChecklistTreinamentosEmpresa(selectedIds) {
    const wrap = document.getElementById('emp-treinamentos-checklist');
    if (!wrap) return;
    selectedIds = selectedIds || [];
    const lista = treinamentosAtivos();
    if (!lista.length) {
      wrap.innerHTML = '<p style="font-size:13px;color:var(--muted);">Nenhum treinamento ativo encontrado.</p>';
      return;
    }
    wrap.innerHTML = lista.map(t => `
      <label class="check-card">
        <input type="checkbox" class="emp-treino-check" value="${t.id}" ${selectedIds.includes(t.id) ? 'checked' : ''}>
        <span><strong>${escapeHtmlSafeV131(t.nome)}</strong><small>Validade padrão: ${t.validade || 12} meses</small></span>
      </label>`).join('');
  }

  function getTreinamentosSelecionadosEmpresa() {
    return Array.from(document.querySelectorAll('.emp-treino-check:checked')).map(c => c.value);
  }

  function renderTreinosExigidosCadastro() {
    const sel = document.getElementById('f-empresa');
    const box = document.getElementById('treinos-exigidos-box');
    const list = document.getElementById('treinos-exigidos-list');
    if (!sel || !box || !list) return;

    if (!sel.value) {
      box.classList.remove('show');
      list.innerHTML = '';
      return;
    }

    box.classList.add('show');
    renderCamposTreinamentos('treinos-exigidos-list', sel.value, [], 'f-treino-data');
  }

  // ──────────────────────────────────────────────────
  //  EMPRESAS — STORAGE
  // ──────────────────────────────────────────────────
