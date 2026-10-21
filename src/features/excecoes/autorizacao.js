  (function configurarV17ExcecaoCheckbox(){
    const css = document.createElement('style');
    css.textContent = `
      .v17-exception-card {
        border: 1px solid #FBBF24;
        background: #FFFBEB;
        border-radius: 18px;
        padding: 18px;
        margin-top: 16px;
      }
      .v17-exception-card h3 {
        font-size: 18px;
        margin-bottom: 6px;
        color: #92400E;
      }
      .v17-exception-card p {
        font-size: 13px;
        color: #92400E;
        line-height: 1.45;
        margin-bottom: 12px;
      }
      .v17-exception-form {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .v17-full { grid-column: 1 / -1; }
      .v17-check-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
        margin-top: 8px;
      }
      .v17-check-option {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 11px 12px;
        background: #fff;
        border: 1px solid #FCD34D;
        border-radius: 12px;
        color: #78350F;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        user-select: none;
      }
      .v17-check-option input {
        width: 20px;
        min-width: 20px;
        height: 20px;
        margin-top: 0;
        accent-color: #D97706;
      }
      .v17-section-title {
        display: block;
        margin-top: 4px;
        margin-bottom: 6px;
        font-size: 12px;
        font-weight: 900;
        color: #92400E;
        text-transform: uppercase;
        letter-spacing: .06em;
      }
      .v17-summary {
        background: #fff;
        border: 1px solid #FCD34D;
        border-radius: 14px;
        padding: 12px;
        margin-top: 12px;
        color: #78350F;
        font-size: 13px;
        line-height: 1.45;
      }
      .v17-summary ul {
        margin: 6px 0 8px 18px;
        padding: 0;
      }
      .v17-summary li { margin: 3px 0; }
      .v17-active-exception {
        background: #fff;
        border: 1px solid #FCD34D;
        border-radius: 14px;
        padding: 14px;
        margin-top: 12px;
        color: #78350F;
        font-size: 13px;
        line-height: 1.5;
      }
      @media (max-width: 700px) {
        .v17-exception-form { grid-template-columns: 1fr; }
        .v17-full { grid-column: 1; }
      }
    `;
    document.head.appendChild(css);
  })();

  const V17_MOTIVOS_EXCECAO = [
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

  const V17_ITENS_EXCECAO = [
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

  function v17Escape(value) {
    if (typeof escapeHtmlSafeV131 === 'function') return escapeHtmlSafeV131(value);
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function v17ListaExcecao(ex, plural, singular) {
    if (Array.isArray(ex?.[plural])) return ex[plural].filter(Boolean);
    if (ex?.[singular]) return String(ex[singular]).split('|').map(x => x.trim()).filter(Boolean);
    return [];
  }

  function v17CheckboxList(name, values, checkedValues = []) {
    const checked = Array.isArray(checkedValues) ? checkedValues : [];
    return `
      <div class="v17-check-grid">
        ${values.map(v => `
          <label class="v17-check-option">
            <input type="checkbox" name="${name}" value="${v17Escape(v)}" ${checked.includes(v) ? 'checked' : ''}>
            <span>${v17Escape(v)}</span>
          </label>
        `).join('')}
      </div>`;
  }

  function v17Checked(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value);
  }

  function v17NumeroAutorizacao() {
    const ano = new Date().getFullYear();
    const qtd = Object.values(getAllExcecoes ? getAllExcecoes() : {}).filter(Boolean).length + 1;
    return `EXC-${ano}-${String(qtd).padStart(4, '0')}`;
  }

  // Exceção expira automaticamente quando passar a data "Liberado até".
  getExcecaoTerceiro = function(id) {
    const all = getAllExcecoes ? getAllExcecoes() : {};
    const ex = all[id];
    if (!ex || !ex.ativo) return null;
    // Registros antigos sem vigência completa não concedem acesso.
    if (!ex.dataLiberacao || !ex.dataAte) return null;
    if (!Array.isArray(ex.pendenciasAutorizadas)) return null;
    if (ex.dataLiberacao > hoje() || ex.dataAte < hoje()) return null;
    return ex;
  };

  salvarLiberacaoExcecao = async function(id) {
    const t = getAll().find(x => x.id === id);
    if (!t) return;
    const aso = statusData(t.aso);
    if (aso.semData || aso.classe === 'blocked') {
      toast('⚠ Regularize o ASO antes de registrar uma exceção.');
      return;
    }
    const situacaoAtual = getStatusBaseSemExcecao(t);
    const pendenciasAutorizadas = [...situacaoAtual.motivos, ...situacaoAtual.avisos];
    if (!pendenciasAutorizadas.length) {
      toast('Não há pendências para liberar por exceção.');
      return;
    }

    const dataLiberacao = document.getElementById('exc-data')?.value || '';
    const dataAte = document.getElementById('exc-data-ate')?.value || '';
    const aprovador = document.getElementById('exc-aprovador')?.value.trim() || '';
    const cargo = document.getElementById('exc-cargo')?.value || '';
    const numeroAutorizacao = document.getElementById('exc-numero')?.value.trim() || v17NumeroAutorizacao();
    const motivos = v17Checked('exc-motivos-v17');
    const documentos = v17Checked('exc-documentos-v17');
    const obs = document.getElementById('exc-obs')?.value.trim() || '';

    if (!dataLiberacao || !dataAte || !aprovador || !cargo || motivos.length === 0) {
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

    const all = { ...getAllExcecoes() };
    all[id] = {
      id: uid(),
      terceiroId: id,
      terceiro: t.nome || '',
      empresa: t.empresa || '',
      cpf: t.cpf || '',
      ativo: true,
      numeroAutorizacao,
      dataLiberacao,
      dataAte,
      aprovador,
      cargo,
      motivo: motivos.join(' | '),
      motivos,
      documentos,
      obs,
      pendenciasAutorizadas,
      criadoEm: new Date().toISOString()
    };

    try { await window.tssExceptionStore.save(id, all[id]); }
    catch(e) { toast('⚠ A exceção não foi salva no banco.'); return; }
    registrarHistorico(
      'terceiro',
      id,
      `Liberação por exceção ${numeroAutorizacao} registrada por ${aprovador} (${cargo}). Motivos: ${motivos.join(', ')}. Itens: ${documentos.join(', ') || 'não informado'}. De ${fmtData(dataLiberacao)} até ${fmtData(dataAte)}.`
    );

    toast('✓ Liberação por exceção registrada.');
    abrirAnalise(id);
    renderDashboard();
    if (document.getElementById('page-listagem')?.classList.contains('active')) renderLista();
  };

  renderExcecaoBox = function(id) {
    const ex = getExcecaoTerceiro(id);

    if (ex) {
      const motivos = v17ListaExcecao(ex, 'motivos', 'motivo');
      const documentos = v17ListaExcecao(ex, 'documentos', 'documento');

      return `
        <div class="v17-exception-card">
          <h3>🟡 Liberado por Exceção</h3>
          <div class="v17-active-exception">
            <b>Nº autorização:</b> ${v17Escape(ex.numeroAutorizacao || 'Não informado')}<br>
            <b>Data da liberação:</b> ${fmtData(ex.dataLiberacao)}<br>
            <b>Liberado até:</b> ${ex.dataAte ? fmtData(ex.dataAte) : 'Não informado'}<br>
            <b>Aprovador:</b> ${v17Escape(ex.aprovador || '')}<br>
            <b>Cargo:</b> ${v17Escape(ex.cargo || '')}<br>

            <b>Motivos autorizados:</b>
            <ul>${motivos.map(m => `<li>${v17Escape(m)}</li>`).join('')}</ul>

            ${documentos.length ? `
              <b>Documentos/itens liberados:</b>
              <ul>${documentos.map(d => `<li>${v17Escape(d)}</li>`).join('')}</ul>
            ` : ''}

            ${ex.obs ? `<b>Observação:</b> ${v17Escape(ex.obs)}<br>` : ''}
            <small>Registrado em ${new Date(ex.criadoEm).toLocaleString('pt-BR')}</small>
          </div>

          <div style="margin-top:12px;">
            <button class="btn btn-danger" onclick="cancelarLiberacaoExcecao('${id}')">Cancelar exceção</button>
          </div>
        </div>`;
    }

    return `
      <div class="v17-exception-card">
        <h3>Liberação por Exceção</h3>
        <p>Use somente quando houver autorização formal para entrada mesmo com pendências. A data de liberação e a data "Liberado até" não podem ser retroativas.</p>

        <div class="v17-exception-form">
          <div>
            <label>Data da liberação *</label>
            <input id="exc-data" type="date" min="${hoje()}" value="${hoje()}">
          </div>

          <div>
            <label>Liberado até *</label>
            <input id="exc-data-ate" type="date" min="${hoje()}" value="${hoje()}">
          </div>

          <div>
            <label>Cargo do aprovador *</label>
            <select id="exc-cargo">
              <option value="">Selecione...</option>
              <option>Gerente da Planta</option>
              <option>Supervisor Industrial</option>
              <option>Coordenador Industrial</option>
              <option>SESMT</option>
              <option>DP</option>
              <option>Segurança Patrimonial</option>
              <option>Outro</option>
            </select>
          </div>

          <div>
            <label>Nº autorização</label>
            <input id="exc-numero" value="${v17NumeroAutorizacao()}" placeholder="EXC-2026-0001">
          </div>

          <div class="v17-full">
            <label>Nome do aprovador *</label>
            <input id="exc-aprovador" placeholder="Ex.: João da Silva">
          </div>

          <div class="v17-full">
            <span class="v17-section-title">Motivos da exceção *</span>
            ${v17CheckboxList('exc-motivos-v17', V17_MOTIVOS_EXCECAO)}
          </div>

          <div class="v17-full">
            <span class="v17-section-title">Documentos/itens liberados</span>
            ${v17CheckboxList('exc-documentos-v17', V17_ITENS_EXCECAO)}
          </div>

          <div class="v17-full">
            <label>Observação</label>
            <textarea id="exc-obs" placeholder="Explique a autorização..."></textarea>
          </div>
        </div>

        <div class="v17-summary">
          <b>Resumo da regra:</b><br>
          O terceiro ficará como <b>liberado por exceção</b> somente até a data informada. Após essa data, a exceção deixa de liberar automaticamente.
        </div>

        <div style="margin-top:12px;">
          <button class="btn btn-primary" onclick="salvarLiberacaoExcecao('${id}')">Liberar por Exceção</button>
        </div>
      </div>`;
  };

  // Portaria com destaque para múltiplos motivos e documentos.
  preencherResultadoPortaria = function(found) {
    _preencherResultadoPortariaV13(found);
    const st = getStatus(found);
    if (!st.excecao) return;

    const ex = st.excecaoDados || {};
    const motivos = v17ListaExcecao(ex, 'motivos', 'motivo');
    const documentos = v17ListaExcecao(ex, 'documentos', 'documento');

    const icon = document.getElementById('r-icon');
    const label = document.getElementById('r-status-label');
    const sub = document.getElementById('r-status-sub');

    if (icon) icon.className = 'status-icon exception';
    if (label) {
      label.textContent = 'LIBERADO POR EXCEÇÃO';
      label.className = 'status-label exception';
    }
    if (sub) sub.textContent = `Autorizado por ${ex.aprovador || 'não informado'} — até ${fmtData(ex.dataAte)}`;

    const motivosWrap = document.getElementById('r-motivos');
    const motivosList = document.getElementById('r-motivos-list');

    if (motivosWrap && motivosList) {
      motivosWrap.style.display = 'block';
      motivosList.innerHTML = `
        <li><b>Nº autorização:</b> ${v17Escape(ex.numeroAutorizacao || 'Não informado')}</li>
        <li><b>Data da liberação:</b> ${fmtData(ex.dataLiberacao)}</li>
        <li><b>Liberado até:</b> ${fmtData(ex.dataAte)}</li>
        <li><b>Aprovador:</b> ${v17Escape(ex.aprovador || '')} — ${v17Escape(ex.cargo || '')}</li>
        ${motivos.map(m => `<li><b>Motivo autorizado:</b> ${v17Escape(m)}</li>`).join('')}
        ${documentos.map(d => `<li><b>Documento/item:</b> ${v17Escape(d)}</li>`).join('')}
        ${ex.obs ? `<li><b>Obs:</b> ${v17Escape(ex.obs)}</li>` : ''}
        ${(st.motivos || []).map(m => `<li>Pendência: ${v17Escape(m)}</li>`).join('')}
        ${(st.avisos || []).map(a => `<li>Aviso: ${v17Escape(a)}</li>`).join('')}
      `;
    }
  };

  // Dashboard de exceções mostrando múltiplos motivos.
  renderExcecoesDashboard = function() {
    const wrap = document.getElementById('dash-excecoes-list');
    if (!wrap) return;
    const all = getAllExcecoes ? getAllExcecoes() : {};
    const itens = Object.values(all)
      .filter(x => x && x.ativo && (!x.dataAte || x.dataAte >= hoje()))
      .sort((a,b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));

    if (!itens.length) {
      wrap.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhuma liberação por exceção ativa.</p>';
      return;
    }

    wrap.innerHTML = itens.slice(0, 20).map(ex => {
      const motivos = v17ListaExcecao(ex, 'motivos', 'motivo');
      return `
        <div class="exception-item" role="button" tabindex="0" data-terceiro-id="${ex.terceiroId}" style="cursor:pointer;">
          <div>
            <strong>${v17Escape(ex.terceiro || 'Terceiro')}</strong>
            <small>${v17Escape(ex.empresa || 'Empresa não informada')} • ${v17Escape(ex.cpf || 'CPF não informado')}</small>
            <small>${v17Escape(ex.numeroAutorizacao || '')} • Até ${fmtData(ex.dataAte)}</small>
            <small>${motivos.map(v17Escape).join(' • ')}</small>
          </div>
          <div><span class="badge badge-exception">EXCEÇÃO</span></div>
        </div>`;
    }).join('');
  };



  // ──────────────────────────────────────────────────
  //  V19.1 — Correção dos cards interativos do Dashboard
  // ──────────────────────────────────────────────────
