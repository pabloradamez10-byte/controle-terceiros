  function v16EnsureDashboard() {
    const dash = document.getElementById('page-dashboard');
    if (!dash || document.getElementById('v16-smart-dashboard')) return;
    const stats = dash.querySelector('.stats-grid');
    if (!stats) return;
    stats.insertAdjacentHTML('afterend', `
      <div id="v16-smart-dashboard" class="v16-smart-grid">
        <div class="v16-card v16-warning" onclick="showPage('pendencias')"><div class="label">Vencem em 30 dias</div><div class="value" id="v16-vencem30">0</div><span class="hint">ASO, integração e contrato</span></div>
        <div class="v16-card v16-danger" onclick="showPage('pendencias')"><div class="label">Sem data informada</div><div class="value" id="v16-semdata">0</div><span class="hint">Itens que precisam regularizar data</span></div>
        <div class="v16-card v16-warning" onclick="document.getElementById('dash-excecoes-list')?.scrollIntoView({behavior:'smooth'})"><div class="label">Exceções ativas</div><div class="value" id="v16-excecoes">0</div><span class="hint">Terceiros liberados por exceção</span></div>
        <div class="v16-card v16-blue" onclick="showPage('empresas')"><div class="label">Empresas sem contrato</div><div class="value" id="v16-empresas-sem-contrato">0</div><span class="hint">Contrato/fim prestação sem data</span></div>
      </div>
    `);
    const ranking = document.getElementById('dash-ranking-empresas')?.closest('.card');
    if (ranking && !document.getElementById('v16-proximos30-list')) {
      ranking.insertAdjacentHTML('beforebegin', `
        <div class="card">
          <div class="card-title">Vencimentos próximos 30 dias</div>
          <div id="v16-proximos30-list" class="v16-list"></div>
        </div>
      `);
    }
  }

  function v16ParseDate(d) { return isDataValidaSistema(d) ? new Date(d + 'T00:00:00') : null; }
  function v16DaysUntil(d) {
    const dt = v16ParseDate(d); if (!dt) return null;
    const h = new Date(hoje() + 'T00:00:00');
    return Math.round((dt - h) / 86400000);
  }
  function v16AddDateItem(list, t, tipo, data) {
    const dias = v16DaysUntil(data);
    if (dias !== null && dias >= 0 && dias <= 30) list.push({terceiroId:t.id, nome:t.nome, empresa:t.empresa, cpf:t.cpf, tipo, data, dias});
  }

  function v16CalcularIndicadores() {
    const terceiros = getAll();
    const empresas = getAllEmpresas();
    const proximos = [];
    let semData = 0;
    terceiros.forEach(t => {
      const emp = empresas.find(e => e.id === t.empresaId) || null;
      ['aso','integ'].forEach(k => { if (!isDataValidaSistema(t[k])) semData++; });
      v16AddDateItem(proximos, t, 'ASO', t.aso);
      v16AddDateItem(proximos, t, 'Integração', t.integ);
      if (emp) v16AddDateItem(proximos, t, 'Fim prestação/contrato empresa', emp.contratoFim || emp.fimPrestacao || emp.contratoValidade);

    });
    const excecoes = Object.values(getAllExcecoes ? getAllExcecoes() : {}).filter(x => x && x.ativo && (!x.dataAte || x.dataAte >= hoje())).length;
    const empresasSemContrato = empresas.filter(e => !isDataValidaSistema(e.contratoFim || e.fimPrestacao || e.contratoValidade)).length;
    return { proximos: proximos.sort((a,b)=>a.dias-b.dias).slice(0,20), semData, excecoes, empresasSemContrato };
  }

  function v16RenderDashboard() {
    v16EnsureDashboard();
    const ind = v16CalcularIndicadores();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('v16-vencem30', ind.proximos.length);
    set('v16-semdata', ind.semData);
    set('v16-excecoes', ind.excecoes);
    set('v16-empresas-sem-contrato', ind.empresasSemContrato);
    const list = document.getElementById('v16-proximos30-list');
    if (list) {
      if (!ind.proximos.length) list.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhum vencimento nos próximos 30 dias.</p>';
      else list.innerHTML = ind.proximos.map(p => `
        <div class="v16-list-item" data-terceiro-id="${p.terceiroId}" onclick="abrirAnalise('${p.terceiroId}')">
          <strong>${escapeHtmlSafeV131(p.nome || 'Sem nome')}</strong>
          <small>${escapeHtmlSafeV131(p.empresa || 'Empresa não informada')} • ${escapeHtmlSafeV131(p.cpf || 'CPF não informado')}</small>
          <div class="v16-chip-row"><span class="v16-chip">${escapeHtmlSafeV131(p.tipo)}</span><span class="v16-chip">${fmtData(p.data)}</span><span class="v16-chip">Faltam ${p.dias} dia(s)</span></div>
        </div>`).join('');
    }
  }

  const _renderDashboardV16 = renderDashboard;
  renderDashboard = function() { _renderDashboardV16(); v16RenderDashboard(); };

  function getArquivosTerceiroV16(id) {
    return JSON.parse(localStorage.getItem('arquivosTerceirosV16') || '{}')[id] || [];
  }
  function saveArquivosTerceiroV16(id, arquivos) {
    const all = JSON.parse(localStorage.getItem('arquivosTerceirosV16') || '{}');
    all[id] = arquivos;
    localStorage.setItem('arquivosTerceirosV16', JSON.stringify(all));
  }
  function adicionarArquivoTerceiroV16(id) {
    const tipo = document.getElementById('v16-doc-tipo')?.value || 'Documento';
    const validade = document.getElementById('v16-doc-validade')?.value || '';
    const obs = document.getElementById('v16-doc-obs')?.value.trim() || '';
    const input = document.getElementById('v16-doc-file');
    const file = input?.files?.[0];
    if (!file) { toast('Selecione um arquivo para anexar.'); return; }
    if (file.size > 900000) { toast('Arquivo muito grande. Para este teste, use arquivo até 900 KB.'); return; }
    const reader = new FileReader();
    reader.onload = function() {
      const arquivos = getArquivosTerceiroV16(id);
      arquivos.unshift({ id: uid(), tipo, validade, obs, nome: file.name, tamanho: file.size, mime: file.type || 'application/octet-stream', dataUrl: reader.result, criadoEm: new Date().toISOString() });
      saveArquivosTerceiroV16(id, arquivos);
      registrarHistorico('terceiro', id, `Documento anexado: ${tipo} - ${file.name}${validade ? ' | validade ' + fmtData(validade) : ''}.`);
      toast('Documento anexado.');
      abrirAnalise(id);
    };
    reader.readAsDataURL(file);
  }
  function removerArquivoTerceiroV16(id, arqId) {
    if (!confirm('Remover este documento anexado?')) return;
    saveArquivosTerceiroV16(id, getArquivosTerceiroV16(id).filter(a => a.id !== arqId));
    registrarHistorico('terceiro', id, 'Documento anexado removido.');
    abrirAnalise(id);
  }
  function baixarArquivoTerceiroV16(id, arqId) {
    const a = getArquivosTerceiroV16(id).find(x => x.id === arqId);
    if (!a) return;
    const link = document.createElement('a');
    link.href = window.sstSafeDocumentURL(a.dataUrl);
    link.download = a.nome || 'documento';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const _abrirAnaliseV16 = abrirAnalise;
  abrirAnalise = function(id) {
    _abrirAnaliseV16(id);
    const box = document.getElementById('analise-conteudo');
    if (!box || document.getElementById('v16-doc-section')) return;
    const arquivos = getArquivosTerceiroV16(id);
    box.insertAdjacentHTML('beforeend', `
      <div class="analysis-section" id="v16-doc-section">
        <strong>Documentos digitais anexados</strong>
        <p style="font-size:13px;color:var(--muted);margin-top:6px;">Use para anexar ASO, integração, certificados de NR, ficha de EPI, contrato/ficha de registro e outros documentos. Os arquivos são sincronizados com o banco e consultados durante a sessão autorizada.</p>
        <div class="v16-doc-form">
          <div><label>Tipo de documento</label><select id="v16-doc-tipo"><option>ASO</option><option>Integração</option><option>Certificado NR</option><option>Ficha EPI</option><option>Contrato/Ficha Registro</option><option>CNH</option><option>Documento DP</option><option>Outro</option></select></div>
          <div><label>Validade, se houver</label><input id="v16-doc-validade" type="date"></div>
          <div class="full"><label>Arquivo</label><input class="file-input" id="v16-doc-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"></div>
          <div class="full"><label>Observação</label><input id="v16-doc-obs" placeholder="Ex.: ASO renovado conforme solicitação do SESMT"></div>
          <div class="full"><button class="btn btn-primary" onclick="adicionarArquivoTerceiroV16('${id}')">Anexar documento</button></div>
        </div>
        <div class="v16-doc-list">
          ${arquivos.length ? arquivos.map(a => `
            <div class="v16-doc-item">
              <div><strong>${escapeHtmlSafeV131(a.tipo)} — ${escapeHtmlSafeV131(a.nome)}</strong><small>${a.validade ? 'Validade: ' + fmtData(a.validade) + ' • ' : ''}Anexado em ${new Date(a.criadoEm).toLocaleString('pt-BR')}</small>${a.obs ? `<small>${escapeHtmlSafeV131(a.obs)}</small>` : ''}</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="baixarArquivoTerceiroV16('${id}','${a.id}')">Baixar</button><button class="btn btn-danger" style="padding:6px 10px;font-size:12px;" onclick="removerArquivoTerceiroV16('${id}','${a.id}')">Remover</button></div>
            </div>`).join('') : '<p style="font-size:13px;color:var(--muted);margin-top:8px;">Nenhum documento digital anexado ainda.</p>'}
        </div>
      </div>
    `);
  };

  // Atualiza o dashboard inteligente ao carregar.
  setTimeout(function(){ try { if (document.getElementById('page-dashboard')?.classList.contains('active')) { renderDashboard(); } } catch(e) { console.warn('V16 dashboard:', e); } }, 80);


  // Registro PWA - instala como app no celular sem interferir nas funções do sistema


  // ──────────────────────────────────────────────────
  //  V19 — Dashboard interativo por status
  // ──────────────────────────────────────────────────
