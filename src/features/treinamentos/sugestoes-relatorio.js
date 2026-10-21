  function normalizarTextoBusca(txt) {
    return (txt || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function sugerirTreinamentosPorFuncao(funcao) {
    const f = normalizarTextoBusca(funcao);
    const sugestoes = new Set(['Integração', 'Uso de EPIs']);
    if (!f.trim()) return [];

    if (f.includes('eletric') || f.includes('manutencao eletr') || f.includes('painel')) {
      sugestoes.add('NR 10 Básico');
      sugestoes.add('NR 10 SEP');
    }
    if (f.includes('altura') || f.includes('telhado') || f.includes('andaime') || f.includes('montador') || f.includes('pedreiro')) {
      sugestoes.add('NR 35 - Trabalho em Altura');
    }
    if (f.includes('confinado') || f.includes('tanque') || f.includes('silo')) {
      sugestoes.add('NR 33 - Trabalhador Autorizado');
      sugestoes.add('NR 33 - Vigia');
    }
    if (f.includes('empilhadeira') || f.includes('operador de empilhadeira')) sugestoes.add('NR 11 - Empilhadeira');
    if (f.includes('ponte rolante') || f.includes('talha')) sugestoes.add('NR 11 - Ponte Rolante');
    if (f.includes('maquina') || f.includes('operador') || f.includes('mecanico') || f.includes('mecanic')) sugestoes.add('NR 12 - Máquinas e Equipamentos');
    if (f.includes('caldeira') || f.includes('vaso') || f.includes('compressor')) sugestoes.add('NR 13 - Caldeiras e Vasos de Pressão');
    if (f.includes('obra') || f.includes('construcao') || f.includes('pedreiro') || f.includes('servente')) sugestoes.add('NR 18 - Construção Civil');
    if (f.includes('inflamavel') || f.includes('combustivel') || f.includes('solda') || f.includes('soldador') || f.includes('quente')) {
      sugestoes.add('NR 20 - Inflamáveis e Combustíveis');
      sugestoes.add('Trabalho a Quente');
    }
    if (f.includes('brigad') || f.includes('incendio')) sugestoes.add('Brigada de Incêndio');
    if (f.includes('motorista') || f.includes('condutor')) sugestoes.add('Direção Defensiva');
    if (f.includes('pta') || f.includes('plataforma')) sugestoes.add('Operador de PTA');
    if (f.includes('munck')) sugestoes.add('Operador de Munck');
    if (f.includes('guindaste')) sugestoes.add('Operador de Guindaste');
    if (f.includes('retroescavadeira')) sugestoes.add('Operador de Retroescavadeira');
    if (f.includes('escavadeira')) sugestoes.add('Operador de Escavadeira');
    if (f.includes('solda') || f.includes('soldador')) sugestoes.add('Soldagem');

    return Array.from(sugestoes);
  }

  function renderSugestoesFuncao() {
    const box = document.getElementById('sugestoes-funcao-box');
    const list = document.getElementById('sugestoes-funcao-list');
    const funcao = document.getElementById('f-funcao')?.value || '';
    if (!box || !list) return;
    const sugestoes = sugerirTreinamentosPorFuncao(funcao);
    if (!funcao.trim() || !sugestoes.length) {
      box.classList.remove('show');
      list.innerHTML = '';
      return;
    }
    box.classList.add('show');
    list.innerHTML = sugestoes.map(s => `<span class="suggestion-tag">${s}</span>`).join('');
  }

  function calcularRankingEmpresasPendencias() {
    const empresas = getAllEmpresas();
    const terceiros = getAll();
    return empresas.map(e => {
      const vinculados = terceiros.filter(t => t.empresaId === e.id || t.empresa === (e.fantasia ? `${e.razao} (${e.fantasia})` : e.razao));
      const pendencias = vinculados.reduce((acc, t) => acc + getStatus(t).motivos.length + (getStatus(t).avisos || []).length, 0);
      const bloqueados = vinculados.filter(t => !getStatus(t).ok).length;
      return { empresa:e, total:vinculados.length, pendencias, bloqueados };
    }).filter(x => x.total > 0 || x.pendencias > 0).sort((a,b) => b.pendencias - a.pendencias || b.bloqueados - a.bloqueados).slice(0,5);
  }

  function renderRankingEmpresas() {
    const wrap = document.getElementById('dash-ranking-empresas');
    if (!wrap) return;
    const ranking = calcularRankingEmpresasPendencias();
    if (!ranking.length) {
      wrap.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhuma empresa com pendência identificada.</p>';
      return;
    }
    wrap.innerHTML = ranking.map((r, idx) => `
      <div class="rank-row" onclick="showPage('listagem'); setTimeout(()=>{ const f=document.getElementById('filtro-empresa-lista'); if(f){ preencherFiltroEmpresas(); f.value='${r.empresa.id}'; renderLista(); } },50)">
        <div><strong>${idx+1}. ${r.empresa.fantasia || r.empresa.razao}</strong><small>${r.total} terceiro(s) • ${r.bloqueados} bloqueado(s)</small></div>
        <div class="rank-num">${r.pendencias}</div>
      </div>`).join('');
  }

  function gerarRelatorioExecutivo() {
    const terceiros = (typeof getAll === 'function') ? getAll() : [];
    const empresas = (typeof getAllEmpresas === 'function') ? getAllEmpresas() : [];
    const st = terceiros.map(t => (typeof getStatus === 'function') ? getStatus(t) : { ok:false, motivos:[] });
    const liberados = st.filter(s => s.ok).length;
    const bloqueados = terceiros.length - liberados;
    const resumo = (typeof getResumoExecutivo === 'function') ? getResumoExecutivo() : { asoVencidos:0, integVencidas:0, treinosPendentes:0, contratosVencidos:0 };
    const data = new Date().toLocaleString('pt-BR');
    const linhas = [
      '<html><head><title>Relatório Controle de Terceiros</title>',
      '<style>body{font-family:Arial,sans-serif;padding:24px;color:#111827}h1{color:#155EEF}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #ddd;padding:8px;text-align:left}.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{border:1px solid #ddd;border-radius:10px;padding:14px}.num{font-size:28px;font-weight:800}.red{color:#DC2626}.green{color:#16A34A}.blue{color:#155EEF}@media print{button{display:none}}</style>',
      '</head><body>',
      '<button onclick="window.print()" style="padding:10px 16px;border:0;background:#155EEF;color:#fff;border-radius:8px;margin-bottom:18px">Salvar/Imprimir PDF</button>',
      '<h1>Relatório de Controle de Terceiros</h1><p>Gerado em '+data+'</p>',
      '<div class="kpi"><div class="card"><b>Total</b><div class="num blue">'+terceiros.length+'</div></div><div class="card"><b>Liberados</b><div class="num green">'+liberados+'</div></div><div class="card"><b>Bloqueados/Pendentes</b><div class="num red">'+bloqueados+'</div></div><div class="card"><b>Empresas</b><div class="num blue">'+empresas.length+'</div></div></div>',
      '<h2>Resumo executivo</h2><table><tr><th>Indicador</th><th>Quantidade</th></tr><tr><td>ASOs vencidos</td><td>'+resumo.asoVencidos+'</td></tr><tr><td>Integrações vencidas</td><td>'+resumo.integVencidas+'</td></tr><tr><td>Treinamentos adicionais registrados</td><td>'+resumo.treinosPendentes+'</td></tr><tr><td>Contratos vencidos</td><td>'+resumo.contratosVencidos+'</td></tr></table>',
      '</body></html>'
    ];
    const win = window.open('', '_blank');
    if (!win) { toast('Não foi possível abrir o relatório. Verifique bloqueio de pop-up.'); return; }
    win.document.write(window.sstSanitizeHTML(linhas.join(''),true));
    win.document.close();
    win.document.querySelectorAll('[data-sst-click]').forEach(button=>{try{if(JSON.parse(button.getAttribute('data-sst-click')).kind==='print')button.addEventListener('click',()=>win.print());}catch(error){}});
  }

  const _renderDashboardV11 = renderDashboard;
  renderDashboard = function() {
    _renderDashboardV11();
    renderRankingEmpresas();
  };

  const _showPageV11 = showPage;
  showPage = function(name) {
    _showPageV11(name);
    if (name === 'dashboard') renderRankingEmpresas();
    if (name === 'cadastro') setTimeout(renderSugestoesFuncao, 20);
  };

  const funcaoInputV11 = document.getElementById('f-funcao');
  if (funcaoInputV11) funcaoInputV11.addEventListener('input', renderSugestoesFuncao);


  inicializarTreinamentosPadrao();
  popularSelectEmpresas('f-empresa');
  renderTreinosExigidosCadastro();

