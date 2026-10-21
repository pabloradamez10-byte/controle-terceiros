  (function configurarV161MultiExcecao(){
    const css = document.createElement('style');
    css.textContent = `
      .multi-check-wrap { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
      .multi-check-item { display:flex; align-items:center; gap:8px; border:1px solid var(--border); background:#fff; border-radius:12px; padding:10px; font-size:13px; font-weight:600; color:var(--text); }
      .multi-check-item input { width:auto; min-width:18px; height:18px; accent-color: var(--accent); }
      .exception-section-title { font-size:12px; font-weight:800; color:#92400E; text-transform:uppercase; letter-spacing:.5px; margin-top:12px; }
      .exception-summary-list { margin:6px 0 0 16px; padding:0; }
      .exception-summary-list li { margin:3px 0; }
      @media (max-width:640px){ .multi-check-wrap { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(css);
  })();

  function getCheckedValuesV161(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value);
  }

  function renderCheckboxesV161(name, values, checkedValues) {
    const checked = Array.isArray(checkedValues) ? checkedValues : [];
    return `<div class="multi-check-wrap">${values.map(v => `
      <label class="multi-check-item">
        <input type="checkbox" name="${name}" value="${escapeHtmlSafeV131(v)}" ${checked.includes(v) ? 'checked' : ''}>
        <span>${escapeHtmlSafeV131(v)}</span>
      </label>`).join('')}</div>`;
  }

  function normalizarListaExcecaoV161(ex, campoPlural, campoSingular) {
    if (Array.isArray(ex?.[campoPlural])) return ex[campoPlural];
    if (ex?.[campoSingular]) return [ex[campoSingular]];
    return [];
  }

  const MOTIVOS_EXCECAO_V161 = [
    'ASO pendente',
    'Integração pendente',
    'Documento DP pendente',
    'Documento SESMT pendente',
    'Contrato de prestação vencido',
    'CNH vencida',
    'Ficha EPI pendente',
    'Emergência operacional',
    'Outro'
  ];

  const DOCUMENTOS_EXCECAO_V161 = [
    'ASO',
    'Integração',
    'Certificado NR',
    'NR 10',
    'NR 33',
    'NR 35',
    'Ficha EPI',
    'Contrato/Ficha Registro',
    'CNH',
    'Documento DP',
    'Documento SESMT',
    'Contrato de Prestação',
    'Outro'
  ];

  salvarLiberacaoExcecao = function(id) {
    const t = getAll().find(x => x.id === id);
    if (!t) return;

    const dataLiberacao = document.getElementById('exc-data')?.value || '';
    const dataAte = document.getElementById('exc-data-ate')?.value || '';
    const aprovador = document.getElementById('exc-aprovador')?.value.trim() || '';
    const cargo = document.getElementById('exc-cargo')?.value || '';
    const motivos = getCheckedValuesV161('exc-motivos');
    const documentos = getCheckedValuesV161('exc-documentos');
    const numeroAutorizacao = document.getElementById('exc-numero')?.value.trim() || gerarNumeroAutorizacaoV161();
    const obs = document.getElementById('exc-obs')?.value.trim() || '';

    if (!dataLiberacao || !dataAte || !aprovador || !cargo || !motivos.length) {
      toast('⚠ Preencha data, liberado até, aprovador, cargo e ao menos um motivo.');
      return;
    }
    if (dataLiberacao < hoje()) {
      toast('⚠ A data da liberação não pode ser retroativa.');
      return;
    }
    if (dataAte < hoje()) {
      toast('⚠ A data "liberado até" não pode ser retroativa.');
      return;
    }
    if (dataAte < dataLiberacao) {
      toast('⚠ A data "liberado até" não pode ser menor que a data da liberação.');
      return;
    }

    const all = getAllExcecoes();
    all[id] = {
      id: uid(),
      terceiroId: id,
      terceiro: t.nome || '',
      empresa: t.empresa || '',
      cpf: t.cpf || '',
      ativo: true,
      dataLiberacao,
      dataAte,
      aprovador,
      cargo,
      motivo: motivos.join(' | '),
      motivos,
      documentos,
      numeroAutorizacao,
      obs,
      criadoEm: new Date().toISOString()
    };
    saveAllExcecoes(all);
    registrarHistorico('terceiro', id, `Liberação por exceção ${numeroAutorizacao} registrada por ${aprovador} (${cargo}). Motivos: ${motivos.join(', ')}. De ${fmtData(dataLiberacao)} até ${fmtData(dataAte)}.`);
    toast('✓ Liberação por exceção registrada.');
    abrirAnalise(id);
    renderDashboard();
    if (document.getElementById('page-listagem')?.classList.contains('active')) renderLista();
  };

  function gerarNumeroAutorizacaoV161() {
    const ano = new Date().getFullYear();
    const total = Object.values(getAllExcecoes()).filter(Boolean).length + 1;
    return `EXC-${ano}-${String(total).padStart(4, '0')}`;
  }

  renderExcecaoBox = function(id) {
    const ex = getExcecaoTerceiro(id);
    if (ex) {
      const motivos = normalizarListaExcecaoV161(ex, 'motivos', 'motivo');
      const documentos = normalizarListaExcecaoV161(ex, 'documentos', 'documento');
      return `
        <div class="exception-box">
          <strong>🟡 Liberado por Exceção</strong>
          <div class="exception-active">
            <b>Nº autorização:</b> ${escapeHtmlSafeV131(ex.numeroAutorizacao || 'Não informado')}<br>
            <b>Data da liberação:</b> ${fmtData(ex.dataLiberacao)}<br>
            <b>Liberado até:</b> ${ex.dataAte ? fmtData(ex.dataAte) : 'Não informado'}<br>
            <b>Aprovador:</b> ${escapeHtmlSafeV131(ex.aprovador)}<br>
            <b>Cargo:</b> ${escapeHtmlSafeV131(ex.cargo)}<br>
            <b>Motivos autorizados:</b>
            <ul class="exception-summary-list">${motivos.map(m => `<li>${escapeHtmlSafeV131(m)}</li>`).join('')}</ul>
            ${documentos.length ? `<b>Documentos/itens envolvidos:</b><ul class="exception-summary-list">${documentos.map(d => `<li>${escapeHtmlSafeV131(d)}</li>`).join('')}</ul>` : ''}
            ${ex.obs ? `<b>Observação:</b> ${escapeHtmlSafeV131(ex.obs)}<br>` : ''}
            <small>Registrado em ${new Date(ex.criadoEm).toLocaleString('pt-BR')}</small>
          </div>
          <div style="margin-top:10px;"><button class="btn btn-danger" onclick="cancelarLiberacaoExcecao('${id}')">Cancelar exceção</button></div>
        </div>`;
    }
    return `
      <div class="exception-box">
        <strong>Liberação por Exceção</strong>
        <p style="font-size:13px;color:#92400E;margin-top:6px;">Use somente quando houver autorização formal para entrada mesmo com pendências. As datas não podem ser retroativas.</p>
        <div class="exception-grid">
          <div><label>Data da liberação *</label><input id="exc-data" type="date" min="${hoje()}" value="${hoje()}"></div>
          <div><label>Liberado até *</label><input id="exc-data-ate" type="date" min="${hoje()}" value="${hoje()}"></div>
          <div><label>Cargo do aprovador *</label><select id="exc-cargo"><option value="">Selecione...</option><option>Gerente da Planta</option><option>Supervisor Industrial</option><option>Coordenador Industrial</option><option>SESMT</option><option>DP</option><option>Segurança Patrimonial</option><option>Outro</option></select></div>
          <div><label>Nº autorização</label><input id="exc-numero" value="${gerarNumeroAutorizacaoV161()}" placeholder="EXC-2026-0001"></div>
          <div class="full"><label>Nome do aprovador *</label><input id="exc-aprovador" placeholder="Ex.: João da Silva"></div>
          <div class="full">
            <div class="exception-section-title">Motivos da exceção *</div>
            ${renderCheckboxesV161('exc-motivos', MOTIVOS_EXCECAO_V161)}
          </div>
          <div class="full">
            <div class="exception-section-title">Documentos/itens autorizados na exceção</div>
            ${renderCheckboxesV161('exc-documentos', DOCUMENTOS_EXCECAO_V161)}
          </div>
          <div class="full"><label>Observação</label><textarea id="exc-obs" placeholder="Explique a autorização..."></textarea></div>
        </div>
        <div class="exception-validity"><b>Regra:</b> o terceiro ficará como liberado por exceção somente até a data informada acima. É possível marcar mais de um motivo.</div>
        <div style="margin-top:12px;"><button class="btn btn-primary" onclick="salvarLiberacaoExcecao('${id}')">Liberar por Exceção</button></div>
      </div>`;
  };

  // Atualiza a portaria para exibir múltiplos motivos/documentos da exceção.
  preencherResultadoPortaria = function(found) {
    _preencherResultadoPortariaV13(found);
    const st = getStatus(found);
    if (!st.excecao) return;
    const ex = st.excecaoDados || {};
    const motivos = normalizarListaExcecaoV161(ex, 'motivos', 'motivo');
    const documentos = normalizarListaExcecaoV161(ex, 'documentos', 'documento');
    const icon = document.getElementById('r-icon');
    const label = document.getElementById('r-status-label');
    const sub = document.getElementById('r-status-sub');
    if (icon) icon.className = 'status-icon exception';
    if (label) { label.textContent = 'LIBERADO POR EXCEÇÃO'; label.className = 'status-label exception'; }
    if (sub) sub.textContent = `Autorizado por ${ex.aprovador || 'não informado'} — até ${fmtData(ex.dataAte)}`;

    const motivosWrap = document.getElementById('r-motivos');
    const motivosList = document.getElementById('r-motivos-list');
    if (motivosWrap && motivosList) {
      motivosWrap.style.display = 'block';
      motivosList.innerHTML = `
        <li><b>Nº autorização:</b> ${escapeHtmlSafeV131(ex.numeroAutorizacao || 'Não informado')}</li>
        <li><b>Data da liberação:</b> ${fmtData(ex.dataLiberacao)}</li>
        <li><b>Liberado até:</b> ${fmtData(ex.dataAte)}</li>
        <li><b>Aprovador:</b> ${escapeHtmlSafeV131(ex.aprovador || '')} — ${escapeHtmlSafeV131(ex.cargo || '')}</li>
        ${motivos.map(m => `<li><b>Motivo autorizado:</b> ${escapeHtmlSafeV131(m)}</li>`).join('')}
        ${documentos.map(d => `<li><b>Documento/item:</b> ${escapeHtmlSafeV131(d)}</li>`).join('')}
        ${ex.obs ? `<li><b>Obs:</b> ${escapeHtmlSafeV131(ex.obs)}</li>` : ''}
        ${(st.motivos || []).map(m => `<li>Pendência: ${escapeHtmlSafeV131(m)}</li>`).join('')}
        ${(st.avisos || []).map(a => `<li>Aviso: ${escapeHtmlSafeV131(a)}</li>`).join('')}`;
    }
  };

  // Melhora a lista de exceções no dashboard para mostrar múltiplos motivos.
  renderExcecoesDashboard = function() {
    const wrap = document.getElementById('dash-excecoes-list');
    if (!wrap) return;
    const all = getAllExcecoes();
    const itens = Object.values(all).filter(x => x && x.ativo && (!x.dataAte || x.dataAte >= hoje())).sort((a,b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
    if (!itens.length) {
      wrap.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhuma liberação por exceção ativa.</p>';
      return;
    }
    wrap.innerHTML = itens.slice(0, 20).map(ex => {
      const motivos = normalizarListaExcecaoV161(ex, 'motivos', 'motivo');
      return `
        <div class="exception-item" role="button" tabindex="0" data-terceiro-id="${ex.terceiroId}" style="cursor:pointer;">
          <div><strong>${escapeHtmlSafeV131(ex.terceiro || 'Terceiro')}</strong><small>${escapeHtmlSafeV131(ex.empresa || 'Empresa não informada')} • ${escapeHtmlSafeV131(ex.cpf || 'CPF não informado')}</small><small>${escapeHtmlSafeV131(ex.numeroAutorizacao || '')} • Até ${fmtData(ex.dataAte)}</small><small>${motivos.map(escapeHtmlSafeV131).join(' • ')}</small></div>
          <div><span class="badge badge-exception">EXCEÇÃO</span></div>
        </div>`;
    }).join('');
  };



  // ──────────────────────────────────────────────────
  //  V17 — Exceção com checkboxes reais no celular
  // ──────────────────────────────────────────────────
