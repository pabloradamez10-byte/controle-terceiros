
(function(){
  const esc = (typeof v21Escape === 'function') ? v21Escape : (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const norm = (s) => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const cleanNum = (v) => parseInt((v ?? '').toString().replace(/[^0-9-]/g,''),10) || 0;
  const todayIso = () => (typeof hoje === 'function' ? hoje() : new Date().toISOString().slice(0,10));
  const isValidDate = (d) => typeof isDataValidaSistema === 'function' ? isDataValidaSistema(d) : !!(d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  const fmt = (d) => typeof fmtData === 'function' ? fmtData(d) : (d || '—');
  const dataIso = (v) => typeof dataParaISO === 'function' ? dataParaISO(v) : (v || '');
  const findCol = (headers, aliases) => {
    const hs = headers.map(h => norm(h));
    for (const a of aliases) {
      const na = norm(a);
      let idx = hs.findIndex(h => h === na || h.includes(na));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const val = (row, idx) => idx >= 0 ? (row[idx] ?? '').toString().trim() : '';

  function getEmpresaNomeV22(e) { return e ? (e.fantasia ? `${e.razao} (${e.fantasia})` : e.razao) : ''; }
  function getTerceiroEmpresaV22(t) { return t.empresa || getEmpresaNomeV22(getAllEmpresas().find(e => e.id === t.empresaId)) || ''; }
  function getAcessosTotalV22(t) { return cleanNum(t.totalAcessos || t.acessosTotal || t.qtdAcessos); }
  function getAcessosAutV22(t) { return cleanNum(t.acessosAutorizados || t.totalAcessosAutorizados); }
  function getAcessosNegV22(t) { return cleanNum(t.acessosNegados || t.totalAcessosNegados); }
  function getUltimoAcessoV22(t) { return t.ultimoAcesso || t.ultimo_acesso || t.dataUltimoAcesso || ''; }
  function diasDesdeIsoV22(iso) {
    if (!iso) return null;
    const d = new Date(iso); if (isNaN(d)) return null;
    const hoje = new Date(todayIso());
    return Math.floor((hoje - d) / 86400000);
  }

  function pendenciasPorTipoV22() {
    const terceiros = getAll();
    const empresas = getAllEmpresas();
    const h = todayIso();
    const out = { aso:[], integracao:[], treinamentos:[], contrato:[], dp:[], sesmt:[], semData:[], acesso90:[] };

    terceiros.forEach(t => {
      const emp = empresas.find(e => e.id === t.empresaId);
      const base = { id:t.id, nome:t.nome || 'Sem nome', cpf:t.cpf || '', empresa:getTerceiroEmpresaV22(t), t };
      const st = getStatus(t);
      if (isValidDate(t.aso) && t.aso < h) out.aso.push({...base, item:'ASO vencido', detalhe:fmt(t.aso)});
      if (isValidDate(t.integ) && t.integ < h) out.integracao.push({...base, item:'Integração vencida', detalhe:fmt(t.integ)});
      if (!isValidDate(t.aso)) out.semData.push({...base, item:'ASO sem data informada', detalhe:''});
      if (!isValidDate(t.integ)) out.semData.push({...base, item:'Integração sem data informada', detalhe:''});



      (t.treinamentosRealizados || []).forEach(reg => {
        const tr = getTreinamentoById(reg.treinamentoId);
        if (tr && isValidDate(reg.data)) out.treinamentos.push({...base, item:'Treinamento adicional: ' + tr.nome, detalhe:'Realizado em ' + fmt(reg.data)});
      });

      if (emp && isValidDate(emp.contratoFim) && emp.contratoFim < h) out.contrato.push({...base, empresaId:emp.id, item:'Contrato da empresa vencido', detalhe:fmt(emp.contratoFim)});
      if ((st.dp?.motivos || []).length || (st.dp?.avisos || []).length) out.dp.push({...base, item:'Pendência DP', detalhe:[...(st.dp.motivos||[]), ...(st.dp.avisos||[])][0] || ''});
      if ((st.sesmt?.motivos || []).length || (st.sesmt?.avisos || []).length) out.sesmt.push({...base, item:'Pendência SESMT', detalhe:[...(st.sesmt.motivos||[]), ...(st.sesmt.avisos||[])][0] || ''});

      const dias = diasDesdeIsoV22(getUltimoAcessoV22(t));
      if (dias !== null && dias >= 90) out.acesso90.push({...base, item:'Sem acesso há 90 dias ou mais', detalhe:`Último acesso: ${fmt(getUltimoAcessoV22(t))}`});
    });
    return out;
  }
  window.pendenciasPorTipoV22 = pendenciasPorTipoV22;

  function resumoAcessosV22() {
    const terceiros = getAll();
    const total = terceiros.reduce((a,t) => a + getAcessosTotalV22(t), 0);
    const autorizados = terceiros.reduce((a,t) => a + getAcessosAutV22(t), 0);
    const negados = terceiros.reduce((a,t) => a + getAcessosNegV22(t), 0);
    const comAcesso = terceiros.filter(t => getAcessosTotalV22(t) > 0).length;
    return { total, autorizados, negados, comAcesso };
  }

  function ensurePageListaV22() {
    if (document.getElementById('page-v22-lista')) return;
    const main = document.querySelector('main');
    const page = document.createElement('div');
    page.id = 'page-v22-lista';
    page.className = 'page';
    page.innerHTML = `
      <div class="page-actions">
        <h2 id="v22-lista-titulo">Lista</h2>
        <button class="btn btn-ghost" onclick="showPage('dashboard')">← Voltar</button>
      </div>
      <div class="card" style="padding:18px 20px;">
        <div class="search-row">
          <div class="search-wrap" style="flex:1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="v22-lista-busca" placeholder="Buscar por nome, CPF ou empresa..." oninput="renderListaV22()" />
          </div>
        </div>
        <div id="v22-lista-conteudo" class="v22-list"></div>
      </div>`;
    main.appendChild(page);
  }

  window.abrirListaV22 = function(tipo) {
    ensurePageListaV22();
    window.v22ListaTipo = tipo;
    const busca = document.getElementById('v22-lista-busca');
    if (busca) busca.value = '';
    renderListaV22();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('page-v22-lista').classList.add('active');
    window.scrollTo({top:0, behavior:'smooth'});
  };

  window.renderListaV22 = function() {
    const tipo = window.v22ListaTipo || 'aso';
    const dados = pendenciasPorTipoV22();
    const labels = {
      aso:'ASOs vencidos', integracao:'Integrações vencidas', treinamentos:'Treinamentos adicionais registrados', contrato:'Contratos vencidos',
      dp:'Pendências DP', sesmt:'Pendências SESMT', semData:'Sem data informada', acesso90:'Sem acesso há 90 dias'
    };
    let lista = dados[tipo] || [];
    const q = norm(document.getElementById('v22-lista-busca')?.value || '');
    if (q) lista = lista.filter(x => norm(`${x.nome} ${x.cpf} ${x.empresa} ${x.item} ${x.detalhe}`).includes(q));
    const titulo = document.getElementById('v22-lista-titulo');
    if (titulo) titulo.textContent = `${labels[tipo] || 'Lista'} (${lista.length})`;
    const wrap = document.getElementById('v22-lista-conteudo');
    if (!wrap) return;
    if (!lista.length) { wrap.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhum registro encontrado.</p>'; return; }
    const max = 120;
    wrap.innerHTML = lista.slice(0,max).map(x => `
      <div class="v22-row" onclick="abrirAnalise('${x.id}')">
        <div><strong>${esc(x.nome)}</strong><small>${esc(x.empresa)} ${x.cpf ? '• ' + esc(x.cpf) : ''}</small><small>${esc(x.item)}</small></div>
        <div class="pendency-detail ${tipo === 'semData' || tipo === 'acesso90' || tipo === 'treinamentos' ? 'neutral' : 'danger'}">${esc(x.detalhe || '')}</div>
      </div>`).join('') + (lista.length > max ? `<p style="text-align:center;color:var(--muted);font-size:12px;">Mostrando ${max} de ${lista.length}. Use a busca para filtrar.</p>` : '');
  };

  function renderBlocoInteligenciaV22() {
    const page = document.getElementById('page-dashboard');
    if (!page) return;
    let box = document.getElementById('v22-inteligencia-dashboard');
    if (!box) {
      box = document.createElement('div');
      box.id = 'v22-inteligencia-dashboard';
      const ref = document.querySelector('#page-dashboard .mini-dashboard') || document.querySelector('#page-dashboard .stats-grid');
      if (ref) ref.insertAdjacentElement('afterend', box); else page.prepend(box);
    }
    const p = pendenciasPorTipoV22();
    const a = resumoAcessosV22();
    box.innerHTML = `
      <div class="card" style="padding:18px 20px;">
        <div class="card-title">Inteligência de Pendências</div>
        <div class="v22-grid">
          <div class="v22-card v22-danger" onclick="abrirListaV22('aso')"><div class="label">ASO vencido</div><div class="value">${p.aso.length}</div><span class="hint">Toque para listar</span></div>
          <div class="v22-card v22-danger" onclick="abrirListaV22('integracao')"><div class="label">Integração vencida</div><div class="value">${p.integracao.length}</div><span class="hint">Toque para listar</span></div>
          <div class="v22-card v22-danger" onclick="abrirListaV22('contrato')"><div class="label">Contrato vencido</div><div class="value">${p.contrato.length}</div><span class="hint">Terceiros afetados</span></div>
          <div class="v22-card v22-warn" onclick="abrirListaV22('dp')"><div class="label">Pendências DP</div><div class="value">${p.dp.length}</div><span class="hint">Documentação/gestão</span></div>
          <div class="v22-card v22-warn" onclick="abrirListaV22('sesmt')"><div class="label">Pendências SESMT</div><div class="value">${p.sesmt.length}</div><span class="hint">Saúde e segurança</span></div>
          <div class="v22-card v22-blue" onclick="abrirListaV22('semData')"><div class="label">Sem data</div><div class="value">${p.semData.length}</div><span class="hint">Precisa completar cadastro</span></div>
          <div class="v22-card v22-blue" onclick="abrirListaV22('acesso90')"><div class="label">Sem acesso 90d</div><div class="value">${p.acesso90.length}</div><span class="hint">Base master/acessos</span></div>
        </div>
      </div>
      <div class="card" style="padding:18px 20px;">
        <div class="card-title">Resumo de Acessos Importados</div>
        <div class="v22-grid">
          <div class="v22-card v22-blue"><div class="label">Total acessos</div><div class="value">${a.total}</div><span class="hint">Registros cruzados</span></div>
          <div class="v22-card v22-ok"><div class="label">Autorizados</div><div class="value">${a.autorizados}</div><span class="hint">Entradas autorizadas</span></div>
          <div class="v22-card v22-danger"><div class="label">Negados</div><div class="value">${a.negados}</div><span class="hint">Tentativas negadas</span></div>
          <div class="v22-card v22-blue"><div class="label">Com histórico</div><div class="value">${a.comAcesso}</div><span class="hint">Terceiros com acesso</span></div>
        </div>
      </div>`;
  }

  const _renderDashboardV22 = renderDashboard;
  renderDashboard = function() {
    _renderDashboardV22();
    renderBlocoInteligenciaV22();
  };

  const _abrirAnaliseV22 = abrirAnalise;
  abrirAnalise = function(id) {
    _abrirAnaliseV22(id);
    const t = getAll().find(x => x.id === id);
    const box = document.getElementById('analise-conteudo');
    if (!t || !box || document.getElementById('v22-acesso-terceiro')) return;
    const html = `
      <div class="analysis-section" id="v22-acesso-terceiro">
        <strong>Histórico de acesso importado</strong>
        <div class="v22-access-panel">
          <div class="v22-access-box"><label>Total de acessos</label><div>${getAcessosTotalV22(t)}</div></div>
          <div class="v22-access-box"><label>Autorizados</label><div style="color:var(--ok)">${getAcessosAutV22(t)}</div></div>
          <div class="v22-access-box"><label>Negados</label><div style="color:var(--danger)">${getAcessosNegV22(t)}</div></div>
          <div class="v22-access-box"><label>Último acesso</label><div>${fmt(getUltimoAcessoV22(t))}</div></div>
          <div class="v22-access-box"><label>Última área</label><div>${esc(t.ultimaArea || t.ultimoLocal || 'Não informado')}</div></div>
          <div class="v22-access-box"><label>Última autorização</label><div>${esc(t.ultimaAutorizacao || 'Não informado')}</div></div>
          <div class="v22-access-box"><label>Dispositivo</label><div>${esc(t.ultimoDispositivo || 'Não informado')}</div></div>
          <div class="v22-access-box"><label>Grupo visitado</label><div>${esc(t.ultimoGrupoVisitado || 'Não informado')}</div></div>
          <div class="v22-access-box"><label>Pessoa visitada</label><div>${esc(t.ultimaPessoaVisitada || 'Não informado')}</div></div>
        </div>
      </div>`;
    box.insertAdjacentHTML('beforeend', html);
  };

  if (typeof abrirPainelEmpresaV21 === 'function') {
    const _abrirPainelEmpresaV22 = abrirPainelEmpresaV21;
    window.abrirPainelEmpresaV21 = abrirPainelEmpresaV21 = function(id) {
      _abrirPainelEmpresaV22(id);
      const box = document.getElementById('v21-empresa-conteudo');
      if (!box || document.getElementById('v22-empresa-acessos')) return;
      const empresa = getAllEmpresas().find(e => e.id === id);
      const nome = getEmpresaNomeV22(empresa);
      const terceiros = getAll().filter(t => t.empresaId === id || getTerceiroEmpresaV22(t) === nome);
      const total = terceiros.reduce((a,t) => a + getAcessosTotalV22(t),0);
      const aut = terceiros.reduce((a,t) => a + getAcessosAutV22(t),0);
      const neg = terceiros.reduce((a,t) => a + getAcessosNegV22(t),0);
      const com = terceiros.filter(t => getAcessosTotalV22(t) > 0).length;
      box.insertAdjacentHTML('afterbegin', `
        <div class="card" id="v22-empresa-acessos">
          <div class="card-title">Acessos da empresa</div>
          <div class="v22-grid">
            <div class="v22-card v22-blue"><div class="label">Total acessos</div><div class="value">${total}</div><span class="hint">Registros importados</span></div>
            <div class="v22-card v22-ok"><div class="label">Autorizados</div><div class="value">${aut}</div><span class="hint">Acessos liberados</span></div>
            <div class="v22-card v22-danger"><div class="label">Negados</div><div class="value">${neg}</div><span class="hint">Acessos negados</span></div>
            <div class="v22-card v22-blue"><div class="label">Terceiros com acesso</div><div class="value">${com}</div><span class="hint">De ${terceiros.length} vinculados</span></div>
          </div>
        </div>`);
    };
  }

  // Importador V22: preserva a importação existente, mas também lê dados da base master de acessos.
  const _importarPlanilhaExcelV22 = importarPlanilhaExcel;
  importarPlanilhaExcel = function(event) {
    const file = event.target.files?.[0];
    if (!file || typeof XLSX === 'undefined') return _importarPlanilhaExcelV22(event);
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const wb = XLSX.read(e.target.result, { type:'array', cellDates:false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header:1, raw:true, defval:'' });
        if (!rows.length) throw new Error('Planilha vazia.');
        const headerIdx = localizarLinhaCabecalho(rows);
        const headers = rows[headerIdx];
        const idxEmpresa = findCol(headers, ['Empresa','Nome da Empresa']);
        const idxCnpj = findCol(headers, ['CNPJ']);
        const idxProf = findCol(headers, ['Nome do Profissional','Profissional','Nome completo','Terceiro']);
        const idxCpf = findCol(headers, ['CPF']);
        const idxFuncao = findCol(headers, ['Função','Funcao','Cargo']);
        const idxAso = findCol(headers, ['Validade ASO','ASO']);
        const idxInteg = findCol(headers, ['Validade Integração','Integração','Integracao']);
        const idxFim = findCol(headers, ['Fim Prestação Serviço','Fim Prestacao Servico','Fim contrato']);
        const idxSituacaoAcesso = findCol(headers, ['Situação Acesso','Situação de Acesso','Situacao Acesso','Status Acesso']);
        const idxSituacaoDP = findCol(headers, ['Situação DP','Situacao DP','Situação Gestão','Gestão de Pessoas']);
        const idxSituacaoSESMT = findCol(headers, ['Situação SESMT','Situacao SESMT','SESMT']);
        const idxObs = findCol(headers, ['Observação','Observacao']);
        const idxTotal = findCol(headers, ['Total Acessos','Acessos Total']);
        const idxAut = findCol(headers, ['Acessos Autorizados']);
        const idxNeg = findCol(headers, ['Acessos Negados']);
        const idxUltAcesso = findCol(headers, ['Último Acesso','Ultimo Acesso']);
        const idxUltAut = findCol(headers, ['Última Autorização','Ultima Autorizacao','Última Autorizacao']);
        const idxArea = findCol(headers, ['Última Área','Ultima Area','Área Acessada']);
        const idxDisp = findCol(headers, ['Último Dispositivo','Ultimo Dispositivo','Dispositivo']);
        const idxGrupo = findCol(headers, ['Último Grupo Visitado','Ultimo Grupo Visitado','Grupo Visitado']);
        const idxPessoa = findCol(headers, ['Última Pessoa Visitada','Ultima Pessoa Visitada','Pessoa Visitada']);
        const idxPrimeiro = findCol(headers, ['Primeiro Acesso']);
        if (idxEmpresa < 0 || idxProf < 0) throw new Error('Não encontrei as colunas mínimas: Empresa e Nome do Profissional.');

        let empresas = getAllEmpresas();
        let terceiros = getAll();
        let novasEmpresas = 0, novosTerceiros = 0, atualizados = 0, ignorados = 0;
        for (let r=headerIdx+1; r<rows.length; r++) {
          const row = rows[r];
          const empresaTxt = val(row, idxEmpresa);
          const profissional = val(row, idxProf);
          if (!empresaTxt || !profissional) { ignorados++; continue; }
          const cnpj = typeof maskCNPJ === 'function' ? maskCNPJ((val(row,idxCnpj) || (typeof extrairCNPJ === 'function' ? extrairCNPJ(empresaTxt) : '')).replace(/\D/g,'')) : val(row,idxCnpj);
          const nomeEmpresa = (typeof limparNomeEmpresa === 'function' ? limparNomeEmpresa(empresaTxt) : empresaTxt) || empresaTxt;
          const fimContrato = dataIso(val(row, idxFim));
          let emp = empresas.find(e => (cnpj && e.cnpj && e.cnpj.replace(/\D/g,'') === cnpj.replace(/\D/g,'')) || norm(e.razao) === norm(nomeEmpresa));
          if (!emp) { emp = { id:uid(), razao:nomeEmpresa, fantasia:'', cnpj:cnpj||'', resp:'', tel:'', email:'', contratoInicio:'', contratoFim:fimContrato||'', treinamentosObrigatorios:[] }; empresas.push(emp); novasEmpresas++; }
          else if (fimContrato && !emp.contratoFim) emp.contratoFim = fimContrato;

          const cpf = typeof maskCPF === 'function' ? maskCPF(val(row, idxCpf)) : val(row, idxCpf);
          const cpfLimpo = cpf.replace(/\D/g,'');
          let terc = terceiros.find(t => (cpfLimpo && t.cpf && t.cpf.replace(/\D/g,'') === cpfLimpo) || (norm(t.nome) === norm(profissional) && (t.empresaId === emp.id || norm(t.empresa) === norm(nomeEmpresa))));
          const dados = {
            nome:profissional, cpf:cpf||'', empresaId:emp.id, empresa:getEmpresaNomeV22(emp), funcao:val(row,idxFuncao)||'',
            aso:dataIso(val(row,idxAso))||'', integ:dataIso(val(row,idxInteg))||'', obs:val(row,idxObs)||'',
            situacaoAcessoImportada:val(row,idxSituacaoAcesso), situacaoDPImportada:val(row,idxSituacaoDP), situacaoSESMTImportada:val(row,idxSituacaoSESMT),
            totalAcessos:cleanNum(val(row,idxTotal)), acessosAutorizados:cleanNum(val(row,idxAut)), acessosNegados:cleanNum(val(row,idxNeg)),
            ultimoAcesso:dataIso(val(row,idxUltAcesso)), ultimaAutorizacao:val(row,idxUltAut), ultimaArea:val(row,idxArea), ultimoDispositivo:val(row,idxDisp), ultimoGrupoVisitado:val(row,idxGrupo), ultimaPessoaVisitada:val(row,idxPessoa), primeiroAcesso:dataIso(val(row,idxPrimeiro))
          };
          if (!terc) { terceiros.push({ id:uid(), ...dados, obs:dados.obs || 'Importado de planilha', treinamentosRealizados:[] }); novosTerceiros++; }
          else {
            Object.keys(dados).forEach(k => { if (dados[k] !== '' && dados[k] !== 0) terc[k] = dados[k]; else if (['totalAcessos','acessosAutorizados','acessosNegados'].includes(k)) terc[k] = dados[k]; });
            // Se a coluna existe, uma célula vazia também é informação: não conservar
            // um ASO/integração antigo como válido após uma nova importação.
            if (idxAso >= 0) terc.aso = dados.aso;
            if (idxInteg >= 0) terc.integ = dados.integ;
            if (idxSituacaoAcesso >= 0) terc.situacaoAcessoImportada = dados.situacaoAcessoImportada;
            atualizados++;
          }
        }
        saveAllEmpresas(empresas); saveAll(terceiros);
        popularSelectEmpresas('f-empresa'); popularSelectEmpresas('e-empresa');
        if (typeof preencherFiltroEmpresas === 'function') preencherFiltroEmpresas();
        renderDashboard(); if (typeof renderDados === 'function') renderDados();
        const msg = `Importação V22 concluída.\nArquivo: ${file.name}\nLinhas lidas: ${Math.max(rows.length-headerIdx-1,0)}\nEmpresas novas: ${novasEmpresas}\nTerceiros novos: ${novosTerceiros}\nTerceiros atualizados: ${atualizados}\nLinhas ignoradas: ${ignorados}\n\nA situação de acesso da planilha é histórica; o aplicativo calcula a autorização atual. Campos adicionais lidos: último acesso, total de acessos, acessos autorizados, acessos negados, última área, dispositivo, grupo e pessoa visitada.`;
        const log = document.getElementById('import-log'); if (log) log.textContent = msg;
        toast('✓ Planilha importada com dados de acesso.');
      } catch(err) {
        const log = document.getElementById('import-log'); if (log) log.textContent = 'Erro na importação V22: ' + err.message;
        toast('⚠ Erro ao importar planilha.');
      } finally { event.target.value = ''; }
    };
    reader.readAsArrayBuffer(file);
  };

  setTimeout(() => { try { ensurePageListaV22(); renderBlocoInteligenciaV22(); } catch(e) { console.warn('V22 init:', e); } }, 200);
})();
