  (function configurarV21(){
    const css = document.createElement('style');
    css.textContent = `
      .v21-alert-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:16px 0 20px; }
      .v21-alert-card { border:1px solid var(--border); background:#fff; border-radius:18px; padding:16px; box-shadow:var(--shadow-sm); cursor:pointer; transition:.15s ease; }
      .v21-alert-card:hover { transform:translateY(-2px); border-color:var(--accent); box-shadow:0 0 0 3px rgba(21,94,239,.10); }
      .v21-alert-card .label { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; font-weight:900; }
      .v21-alert-card .value { font-size:30px; font-weight:900; margin-top:8px; color:var(--warn); }
      .v21-alert-card.danger .value { color:var(--danger); }
      .v21-alert-card.blue .value { color:var(--accent); }
      .v21-alert-card small { display:block; color:var(--muted); margin-top:6px; font-size:12px; }
      .v21-panel-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:18px; }
      .v21-panel-card { background:#fff; border:1px solid var(--border); border-radius:18px; padding:16px; box-shadow:var(--shadow-sm); }
      .v21-panel-card .label { font-size:11px; color:var(--muted); text-transform:uppercase; font-weight:900; letter-spacing:.07em; }
      .v21-panel-card .value { font-size:28px; font-weight:900; margin-top:8px; }
      .v21-info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .v21-info-box { border:1px solid var(--border); border-radius:16px; background:var(--bg-soft); padding:14px; }
      .v21-info-box label { color:var(--muted); font-size:11px; text-transform:uppercase; font-weight:900; letter-spacing:.06em; }
      .v21-info-box div { margin-top:4px; font-weight:700; }
      .v21-list { display:grid; gap:10px; }
      .v21-row { border:1px solid var(--border); border-radius:14px; background:#fff; padding:13px; cursor:pointer; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
      .v21-row:hover { border-color:var(--accent); box-shadow:0 0 0 3px rgba(21,94,239,.08); }
      .v21-row strong { display:block; }
      .v21-row small { color:var(--muted); display:block; margin-top:4px; }
      .v21-company-open { cursor:pointer; }
      .v21-company-open:hover { color:var(--accent); text-decoration:underline; }
      @media (max-width:800px){ .v21-alert-grid,.v21-panel-grid,.v21-info-grid{grid-template-columns:1fr;} .v21-row{display:block;} }
    `;
    document.head.appendChild(css);

    const main = document.querySelector('main');
    if (main && !document.getElementById('page-alertas-v21')) {
      const alertas = document.createElement('div');
      alertas.id = 'page-alertas-v21';
      alertas.className = 'page';
      alertas.innerHTML = `
        <div class="page-actions">
          <h2 id="v21-alertas-titulo">Alertas</h2>
          <button class="btn btn-ghost" onclick="showPage('dashboard')">← Voltar</button>
        </div>
        <div class="card" style="padding:18px 20px;">
          <div class="search-row">
            <div class="search-wrap" style="flex:1">
              <input id="v21-alertas-busca" placeholder="Buscar por nome, CPF ou empresa..." oninput="renderAlertasV21Atual()">
            </div>
          </div>
          <div id="v21-alertas-lista" class="v21-list"></div>
        </div>`;
      main.appendChild(alertas);
    }
    if (main && !document.getElementById('page-empresa-painel-v21')) {
      const painel = document.createElement('div');
      painel.id = 'page-empresa-painel-v21';
      painel.className = 'page';
      painel.innerHTML = `
        <div class="page-actions">
          <h2 id="v21-empresa-titulo">Painel da Empresa</h2>
          <button class="btn btn-ghost" onclick="showPage('empresas')">← Voltar</button>
        </div>
        <div id="v21-empresa-conteudo"></div>`;
      main.appendChild(painel);
    }
  })();

  function v21Escape(v) {
    return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function v21ShowPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function v21EmpresaNome(e) {
    if (!e) return 'Empresa não localizada';
    return e.fantasia ? `${e.razao} (${e.fantasia})` : e.razao;
  }

  function v21GetDias(iso) {
    if (!isDataValidaSistema(iso)) return null;
    return diffDias(iso);
  }

  function montarAlertasV21() {
    const alertas = { aso30:[], integracao30:[], contratos30:[], treinos30:[] };
    const empresas = getAllEmpresas();
    const terceiros = getAll();
    const add = (tipo, t, item, vencimento, detalhe) => {
      const dias = v21GetDias(vencimento);
      if (dias === null || dias < 0 || dias > 30) return;
      alertas[tipo].push({ terceiroId:t.id, terceiro:t.nome || 'Sem nome', empresa:t.empresa || 'Sem empresa', cpf:t.cpf || 'Sem CPF', item, vencimento, dias, detalhe: detalhe || '' });
    };
    terceiros.forEach(t => {
      add('aso30', t, 'ASO', t.aso, 'Documento ocupacional');
      add('integracao30', t, 'Integração', t.integ, 'Integração obrigatória');

    });
    empresas.forEach(e => {
      const dias = v21GetDias(e.contratoFim);
      if (dias === null || dias < 0 || dias > 30) return;
      const vinculados = terceiros.filter(t => t.empresaId === e.id || t.empresa === v21EmpresaNome(e));
      alertas.contratos30.push({ empresaId:e.id, terceiro:'Contrato da empresa', empresa:v21EmpresaNome(e), cpf:e.cnpj || '', item:'Fim da prestação de serviço', vencimento:e.contratoFim, dias, detalhe:`${vinculados.length} terceiro(s) vinculados` });
    });
    Object.values(alertas).forEach(lista => lista.sort((a,b) => (a.dias ?? 999) - (b.dias ?? 999) || (a.terceiro || '').localeCompare(b.terceiro || '')));
    return alertas;
  }

  function garantirCardsAlertasV21() {
    const page = document.getElementById('page-dashboard');
    if (!page || document.getElementById('v21-alertas-dashboard')) return;
    const ref = page.querySelector('.mini-dashboard') || page.querySelector('.stats-grid');
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.id = 'v21-alertas-dashboard';
    wrap.innerHTML = `
      <div class="card-title">Alertas automáticos — próximos 30 dias</div>
      <div class="v21-alert-grid">
        <div class="v21-alert-card" onclick="abrirAlertasV21('aso30')"><div class="label">ASOs vencendo</div><div class="value" id="v21-alert-aso30">0</div><small>Toque para ver a lista</small></div>
        <div class="v21-alert-card" onclick="abrirAlertasV21('integracao30')"><div class="label">Integrações vencendo</div><div class="value" id="v21-alert-integracao30">0</div><small>Toque para ver a lista</small></div>
        <div class="v21-alert-card danger" onclick="abrirAlertasV21('contratos30')"><div class="label">Contratos vencendo</div><div class="value" id="v21-alert-contratos30">0</div><small>Toque para ver empresas</small></div>
      </div>`;
    if (ref) ref.insertAdjacentElement('afterend', wrap);
    else page.prepend(wrap);
  }

  function renderCardsAlertasV21() {
    garantirCardsAlertasV21();
    const a = montarAlertasV21();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('v21-alert-aso30', a.aso30.length);
    set('v21-alert-integracao30', a.integracao30.length);
    set('v21-alert-contratos30', a.contratos30.length);
    set('v21-alert-treinos30', a.treinos30.length);
  }

  window.v21AlertaAtual = 'aso30';
  function labelAlertaV21(tipo) {
    return ({ aso30:'ASOs vencendo nos próximos 30 dias', integracao30:'Integrações vencendo nos próximos 30 dias', contratos30:'Contratos de empresas vencendo nos próximos 30 dias', treinos30:'Treinamentos vencendo nos próximos 30 dias' })[tipo] || 'Alertas';
  }
  function abrirAlertasV21(tipo) {
    window.v21AlertaAtual = tipo || 'aso30';
    const busca = document.getElementById('v21-alertas-busca');
    if (busca) busca.value = '';
    v21ShowPage('page-alertas-v21');
    renderAlertasV21Atual();
  }
  function renderAlertasV21Atual() {
    const tipo = window.v21AlertaAtual || 'aso30';
    const all = montarAlertasV21()[tipo] || [];
    const q = (document.getElementById('v21-alertas-busca')?.value || '').toLowerCase().trim();
    const lista = q ? all.filter(x => correspondeBuscaSST(q, [x.terceiro, x.empresa], [x.cpf])) : all;
    const titulo = document.getElementById('v21-alertas-titulo');
    if (titulo) titulo.textContent = `${labelAlertaV21(tipo)} (${lista.length})`;
    const wrap = document.getElementById('v21-alertas-lista');
    if (!wrap) return;
    if (!lista.length) {
      wrap.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhum registro encontrado para este alerta.</p>';
      return;
    }
    wrap.innerHTML = lista.map(x => `
      <div class="v21-row" ${x.terceiroId ? `onclick="abrirAnalise('${x.terceiroId}')"` : `onclick="abrirPainelEmpresaV21('${x.empresaId}')"`}>
        <div>
          <strong>${v21Escape(x.terceiro)}</strong>
          <small>${v21Escape(x.empresa)} ${x.cpf ? '• ' + v21Escape(x.cpf) : ''}</small>
          <small>${v21Escape(x.item)} ${x.detalhe ? '• ' + v21Escape(x.detalhe) : ''}</small>
        </div>
        <div class="pendency-detail warn">Vence em ${fmtData(x.vencimento)}<br>faltam ${x.dias} dia(s)</div>
      </div>`).join('');
  }

  function abrirPainelEmpresaV21(id) {
    const empresa = getAllEmpresas().find(e => e.id === id);
    if (!empresa) { toast('Empresa não localizada.'); return; }
    const terceiros = getAll().filter(t => t.empresaId === id || t.empresa === v21EmpresaNome(empresa));
    const analisados = terceiros.map(t => ({ t, st:getStatus(t) }));
    const liberados = analisados.filter(x => x.st.ok && !x.st.excecao && !x.st.pendente && !x.st.bloqueado).length;
    const bloqueados = analisados.filter(x => x.st.bloqueado && !x.st.excecao).length;
    const pendentes = analisados.filter(x => x.st.pendente && !x.st.excecao).length;
    const excecoes = analisados.filter(x => x.st.excecao).length;
    const treinos = (empresa.treinamentosObrigatorios || []).map(idTr => getAllTreinamentos().find(t => t.id === idTr)).filter(Boolean);
    const titulo = document.getElementById('v21-empresa-titulo');
    if (titulo) titulo.textContent = v21EmpresaNome(empresa);
    const box = document.getElementById('v21-empresa-conteudo');
    if (!box) return;
    box.innerHTML = `
      <div class="v21-panel-grid">
        <div class="v21-panel-card"><div class="label">Total terceiros</div><div class="value">${terceiros.length}</div></div>
        <div class="v21-panel-card"><div class="label">Liberados</div><div class="value" style="color:var(--ok)">${liberados}</div></div>
        <div class="v21-panel-card"><div class="label">Pendentes</div><div class="value" style="color:var(--warn)">${pendentes + excecoes}</div></div>
        <div class="v21-panel-card"><div class="label">Bloqueados</div><div class="value" style="color:var(--danger)">${bloqueados}</div></div>
      </div>
      <div class="card">
        <div class="card-title">Dados da empresa</div>
        <div class="v21-info-grid">
          <div class="v21-info-box"><label>CNPJ</label><div>${v21Escape(empresa.cnpj || 'Não informado')}</div></div>
          <div class="v21-info-box"><label>Responsável</label><div>${v21Escape(empresa.resp || 'Não informado')}</div></div>
          <div class="v21-info-box"><label>Telefone</label><div>${v21Escape(empresa.tel || 'Não informado')}</div></div>
          <div class="v21-info-box"><label>E-mail</label><div>${v21Escape(empresa.email || 'Não informado')}</div></div>
          <div class="v21-info-box"><label>Início prestação</label><div>${fmtData(empresa.contratoInicio)}</div></div>
          <div class="v21-info-box"><label>Fim prestação</label><div>${fmtData(empresa.contratoFim)} ${tagData(empresa.contratoFim)}</div></div>
          <div class="v21-info-box"><label>Documentos DP</label><div>${fmtData(empresa.docDPValidade)} ${tagData(empresa.docDPValidade)}</div></div>
          <div class="v21-info-box"><label>Documentos SESMT</label><div>${fmtData(empresa.docSESMTValidade)} ${tagData(empresa.docSESMTValidade)}</div></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
          <button class="btn btn-primary" onclick="abrirTerceirosDaEmpresaV21('${empresa.id}')">Ver terceiros desta empresa</button>
          <button class="btn btn-ghost" onclick="abrirModalEditarEmpresa('${empresa.id}')">Editar empresa</button>
        </div>
      </div>
      <div class="card"><div class="card-title">Treinamentos adicionais</div>
        <div class="training-tags">${treinos.length ? treinos.map(t => `<span class="training-tag">${v21Escape(t.nome)}</span>`).join('') : '<span style="color:var(--muted);font-size:14px;">Nenhum treinamento obrigatório vinculado.</span>'}</div>
      </div>
      <div class="card"><div class="card-title">Terceiros vinculados</div><div class="v21-list">
        ${terceiros.slice(0,120).map(t => { const st = getStatus(t); const badge = st.excecao ? '<span class="badge badge-exception">Exceção</span>' : (st.ok && !st.pendente ? '<span class="badge badge-ok">Liberado</span>' : (st.pendente ? '<span class="badge badge-warn">Pendente</span>' : '<span class="badge badge-blocked">Bloqueado</span>')); return `<div class="v21-row" onclick="abrirAnalise('${t.id}')"><div><strong>${v21Escape(t.nome || 'Sem nome')}</strong><small>${v21Escape(t.cpf || 'CPF não informado')} • ${v21Escape(t.funcao || 'Função não informada')}</small></div><div>${badge}</div></div>`; }).join('') || '<p style="font-size:14px;color:var(--muted);">Nenhum terceiro vinculado.</p>'}
        ${terceiros.length > 120 ? `<p style="font-size:12px;color:var(--muted);text-align:center;">Mostrando 120 de ${terceiros.length}. Use o botão acima para ver todos.</p>` : ''}
      </div></div>`;
    v21ShowPage('page-empresa-painel-v21');
  }

  function abrirTerceirosDaEmpresaV21(id) {
    window.filtroStatusDashboard = 'todos';
    showPage('listagem');
    setTimeout(() => {
      const filtro = document.getElementById('filtro-empresa-lista');
      if (filtro) filtro.value = id;
      const busca = document.getElementById('busca-lista');
      if (busca) busca.value = '';
      renderLista();
    }, 80);
  }

  // Sobrescreve renderEmpresas apenas para adicionar o botão Painel sem alterar o restante.
  const _renderEmpresasV21 = renderEmpresas;
  renderEmpresas = function() {
    _renderEmpresasV21();
    const tbody = document.getElementById('tabela-empresas');
    if (!tbody) return;
    const q = (document.getElementById('busca-empresas')?.value || '').toLowerCase().trim();
    let lista = getAllEmpresas();
    if (q) lista = lista.filter(e => correspondeBuscaSST(q, [e.razao, e.fantasia], [e.cnpj]));
    Array.from(tbody.querySelectorAll('tr')).forEach((tr, idx) => {
      const e = lista[idx];
      if (!e) return;
      const first = tr.querySelector('td.td-name');
      if (first) { first.classList.add('v21-company-open'); first.onclick = () => abrirPainelEmpresaV21(e.id); first.title = 'Abrir painel da empresa'; }
      const actions = tr.querySelector('.actions');
      if (actions && !actions.querySelector('.v21-painel-btn')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-ghost v21-painel-btn';
        btn.style.cssText = 'padding:5px 12px;font-size:12px;';
        btn.textContent = 'Painel';
        btn.onclick = function(ev){ ev.stopPropagation(); abrirPainelEmpresaV21(e.id); };
        actions.prepend(btn);
      }
    });
  };

  const _renderDashboardV21 = renderDashboard;
  renderDashboard = function() {
    _renderDashboardV21();
    renderCardsAlertasV21();
  };

  setTimeout(function(){ try { renderCardsAlertasV21(); } catch(e) { console.warn('V21 alertas:', e); } }, 150);

