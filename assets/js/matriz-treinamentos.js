
// ──────────────────────────────────────────────────
// V23.1 — Matriz de Treinamentos por Função
// Cursos recomendados viram checkboxes reais e podem ser salvos no cadastro.
// ──────────────────────────────────────────────────
(function(){
  const css = `
    .matrix-box { margin-top: 18px; padding: 20px; border: 1px solid var(--border); border-radius: 18px; background: #fff; box-shadow: var(--shadow); }
    .matrix-title { font-size: 14px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 10px; }
    .matrix-sub { font-size: 13px; color: var(--muted); line-height: 1.45; margin-bottom: 14px; }
    .matrix-group { margin-top: 16px; }
    .matrix-group h4 { font-size: 13px; color: var(--text); margin-bottom: 10px; }
    .matrix-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:10px; }
    .matrix-check { display:flex; gap:10px; align-items:flex-start; border:1px solid var(--border); background:var(--bg-soft); border-radius:14px; padding:12px; }
    .matrix-check.recommended { border-color: rgba(21,94,239,.28); background: var(--accent-lt); }
    .matrix-check input[type="checkbox"] { width:22px; height:22px; flex:0 0 auto; accent-color: var(--accent); margin-top:2px; }
    .matrix-check strong { display:block; font-size:14px; line-height:1.25; }
    .matrix-check small { display:block; font-size:12px; color:var(--muted); margin:3px 0 8px; }
    .matrix-check .training-date { display:none; margin-top:6px; padding:10px 12px; border-radius:10px; background:#fff; }
    .matrix-check.checked .training-date { display:block; }
    .matrix-summary { margin-top:14px; padding:12px 14px; border-radius:14px; background:#F8FAFC; border:1px solid var(--border); font-size:13px; color:var(--muted); line-height:1.5; }
    .matrix-summary strong { color:var(--text); }
    .matrix-manual { display:grid; grid-template-columns:1fr 150px; gap:10px; margin-top:10px; }
    @media (max-width: 700px) { .matrix-grid, .matrix-manual { grid-template-columns:1fr; } }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function nrm(txt){
    try { return (txt || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
    catch(e){ return (txt || '').toString().toLowerCase().trim(); }
  }

  function findTreinoByName(nome){
    const alvo = nrm(nome);
    const todos = (typeof getAllTreinamentos === 'function') ? getAllTreinamentos() : [];
    return todos.find(t => nrm(t.nome) === alvo) || todos.find(t => nrm(t.nome).includes(alvo) || alvo.includes(nrm(t.nome)));
  }

  function ensureTreino(nome){
    if (!nome || !nome.trim()) return null;
    const existente = findTreinoByName(nome);
    if (existente) return existente;
    const todos = (typeof getAllTreinamentos === 'function') ? getAllTreinamentos() : [];
    const novo = { id: (typeof uid === 'function' ? uid() : String(Date.now())), nome: nome.trim(), validade: 12, ativo: true };
    todos.push(novo);
    if (typeof saveAllTreinamentos === 'function') saveAllTreinamentos(todos);
    return novo;
  }

  function sugestoesAtuais(){
    const funcao = document.getElementById('f-funcao')?.value || '';
    if (typeof sugerirTreinamentosPorFuncao === 'function') return sugerirTreinamentosPorFuncao(funcao);
    return [];
  }

  function inserirMatrizBox(){
    if (document.getElementById('matriz-funcao-box')) return;
    const ref = document.getElementById('sugestoes-funcao-box') || document.getElementById('treinos-exigidos-box');
    if (!ref || !ref.parentNode) return;
    const box = document.createElement('div');
    box.id = 'matriz-funcao-box';
    box.className = 'matrix-box';
    box.style.display = 'none';
    box.innerHTML = `
      <div class="matrix-title">Treinamentos por função</div>
      <div class="matrix-sub">Ao informar a função, o sistema recomenda cursos. Você pode manter os recomendados marcados e também selecionar outros treinamentos.</div>
      <div class="matrix-group">
        <h4>Recomendados automaticamente</h4>
        <div id="matriz-recomendados" class="matrix-grid"></div>
      </div>
      <div class="matrix-group">
        <h4>Outros treinamentos disponíveis</h4>
        <div id="matriz-outros" class="matrix-grid"></div>
      </div>
      <div class="matrix-group">
        <h4>Outro curso manual</h4>
        <div class="matrix-manual">
          <input id="matriz-outro-nome" type="text" placeholder="Ex.: Treinamento específico do cliente" />
          <input id="matriz-outro-data" type="date" />
        </div>
        <small style="display:block;color:var(--muted);font-size:12px;margin-top:6px;">Se preencher, o sistema cria esse treinamento no catálogo e vincula ao terceiro.</small>
      </div>
      <div id="matriz-resumo" class="matrix-summary">Nenhum treinamento selecionado ainda.</div>
    `;
    ref.insertAdjacentElement('afterend', box);
  }

  function cardTreino(t, recomendado, checked){
    const validade = t.validade || 12;
    const id = t.id;
    const safeName = (t.nome || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `
      <label class="matrix-check ${recomendado ? 'recommended' : ''} ${checked ? 'checked' : ''}" data-training-card="${id}">
        <input type="checkbox" class="matriz-treino-check" value="${id}" data-nome="${safeName}" ${checked ? 'checked' : ''}>
        <span style="width:100%;">
          <strong>${safeName}</strong>
          <small>${recomendado ? 'Recomendado pela função' : 'Opcional'} • validade padrão: ${validade} meses</small>
          <input type="date" class="training-date matriz-treino-data" data-treinamento-id="${id}">
        </span>
      </label>`;
  }

  function atualizarResumoMatriz(){
    const resumo = document.getElementById('matriz-resumo');
    if (!resumo) return;
    const selecionados = Array.from(document.querySelectorAll('.matriz-treino-check:checked')).map(c => c.dataset.nome || c.value);
    const outro = (document.getElementById('matriz-outro-nome')?.value || '').trim();
    if (outro) selecionados.push(outro);
    resumo.innerHTML = selecionados.length ? `<strong>${selecionados.length} treinamento(s) selecionado(s):</strong><br>${selecionados.map(x=>'✓ '+x).join('<br>')}` : 'Nenhum treinamento selecionado ainda.';
  }

  function bindMatrizChecks(){
    document.querySelectorAll('.matriz-treino-check').forEach(chk => {
      chk.addEventListener('change', () => {
        const card = chk.closest('.matrix-check');
        if (card) card.classList.toggle('checked', chk.checked);
        atualizarResumoMatriz();
      });
    });
    document.querySelectorAll('.matriz-treino-data').forEach(inp => inp.addEventListener('change', atualizarResumoMatriz));
    const outro = document.getElementById('matriz-outro-nome');
    const outroData = document.getElementById('matriz-outro-data');
    if (outro) outro.addEventListener('input', atualizarResumoMatriz);
    if (outroData) outroData.addEventListener('change', atualizarResumoMatriz);
  }

  window.renderMatrizTreinamentosFuncao = function(){
    inserirMatrizBox();
    const box = document.getElementById('matriz-funcao-box');
    const recWrap = document.getElementById('matriz-recomendados');
    const outWrap = document.getElementById('matriz-outros');
    const funcao = document.getElementById('f-funcao')?.value || '';
    if (!box || !recWrap || !outWrap) return;
    if (!funcao.trim()) {
      box.style.display = 'none';
      recWrap.innerHTML = '';
      outWrap.innerHTML = '';
      atualizarResumoMatriz();
      return;
    }
    box.style.display = 'block';

    if (typeof inicializarTreinamentosPadrao === 'function') inicializarTreinamentosPadrao();
    const todos = (typeof treinamentosAtivos === 'function' ? treinamentosAtivos() : (typeof getAllTreinamentos === 'function' ? getAllTreinamentos() : [])).filter(t => t.ativo !== false);
    const nomesSugeridos = sugestoesAtuais();
    const sugeridos = nomesSugeridos.map(nome => ensureTreino(nome)).filter(Boolean);
    const idsSugeridos = new Set(sugeridos.map(t => t.id));
    const outros = todos.filter(t => !idsSugeridos.has(t.id)).sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));

    recWrap.innerHTML = sugeridos.length ? sugeridos.map(t => cardTreino(t, true, true)).join('') : '<p style="font-size:13px;color:var(--muted);">Nenhum treinamento recomendado para esta função.</p>';
    outWrap.innerHTML = outros.length ? outros.map(t => cardTreino(t, false, false)).join('') : '<p style="font-size:13px;color:var(--muted);">Nenhum outro treinamento ativo no catálogo.</p>';
    bindMatrizChecks();
    atualizarResumoMatriz();
  };

  window.coletarTreinamentosMatrizFuncao = function(){
    const itens = [];
    document.querySelectorAll('.matriz-treino-check:checked').forEach(chk => {
      const id = chk.value;
      const data = document.querySelector(`.matriz-treino-data[data-treinamento-id="${id}"]`)?.value || '';
      itens.push({ treinamentoId: id, data, origem: 'matriz_funcao' });
    });
    const outroNome = (document.getElementById('matriz-outro-nome')?.value || '').trim();
    if (outroNome) {
      const tr = ensureTreino(outroNome);
      if (tr) itens.push({ treinamentoId: tr.id, data: document.getElementById('matriz-outro-data')?.value || '', origem: 'manual_funcao' });
    }
    return itens;
  };

  function mergeTreinos(a, b){
    const map = new Map();
    (a || []).forEach(x => { if (x && x.treinamentoId) map.set(x.treinamentoId, x); });
    (b || []).forEach(x => { if (x && x.treinamentoId) map.set(x.treinamentoId, { ...(map.get(x.treinamentoId) || {}), ...x }); });
    return Array.from(map.values());
  }

  const salvarAnteriorV231 = window.salvarTerceiro;
  if (typeof salvarAnteriorV231 === 'function') {
    window.salvarTerceiro = function(){
      const antes = new Set((typeof getAll === 'function' ? getAll() : []).map(t => t.id));
      const matriz = window.coletarTreinamentosMatrizFuncao ? window.coletarTreinamentosMatrizFuncao() : [];
      salvarAnteriorV231();
      try {
        const lista = getAll();
        const novo = lista.find(t => !antes.has(t.id));
        if (novo && matriz.length) {
          novo.treinamentosRealizados = mergeTreinos(novo.treinamentosRealizados || [], matriz);
          saveAll(lista);
          if (typeof registrarHistorico === 'function') registrarHistorico('terceiro', novo.id, `Treinamentos vinculados pela função: ${matriz.length}.`);
        }
      } catch(e) { console.warn('V23.1 salvar matriz:', e); }
    };
  }

  const limparAnteriorV231 = window.limparForm;
  if (typeof limparAnteriorV231 === 'function') {
    window.limparForm = function(){
      limparAnteriorV231();
      const outroNome = document.getElementById('matriz-outro-nome');
      const outroData = document.getElementById('matriz-outro-data');
      if (outroNome) outroNome.value = '';
      if (outroData) outroData.value = '';
      if (window.renderMatrizTreinamentosFuncao) window.renderMatrizTreinamentosFuncao();
    };
  }

  function initV231(){
    inserirMatrizBox();
    const funcao = document.getElementById('f-funcao');
    if (funcao && !funcao.dataset.v231) {
      funcao.dataset.v231 = '1';
      funcao.addEventListener('input', () => setTimeout(window.renderMatrizTreinamentosFuncao, 20));
      funcao.addEventListener('change', () => setTimeout(window.renderMatrizTreinamentosFuncao, 20));
    }
    if (window.renderMatrizTreinamentosFuncao) window.renderMatrizTreinamentosFuncao();
  }

  const showPageAnteriorV231 = window.showPage;
  if (typeof showPageAnteriorV231 === 'function') {
    window.showPage = function(name){
      showPageAnteriorV231(name);
      if (name === 'cadastro') setTimeout(initV231, 60);
    };
  }

  setTimeout(initV231, 300);
})();
