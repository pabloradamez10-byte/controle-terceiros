  getStatusDP = function(t) {
    const motivos = [];
    const avisos = [];
    const empresa = getEmpresaById(t.empresaId);
    if (!empresa) {
      avisos.push('Empresa não vinculada ao cadastro');
      return { ok:true, motivos, avisos, pendente:true };
    }

    const contrato = statusData(empresa.contratoFim);
    if (contrato.semData) avisos.push('Fim da prestação de serviço sem data informada');
    else if (contrato.classe === 'blocked') motivos.push('Fim da prestação de serviço vencido em ' + fmtData(empresa.contratoFim));
    else if (contrato.classe === 'warn') avisos.push('Fim da prestação de serviço ' + contrato.texto.toLowerCase());

    const docDP = statusData(empresa.docDPValidade);
    if (docDP.semData) avisos.push('Documentos DP sem data informada');
    else if (docDP.classe === 'blocked') motivos.push('Documentos DP vencidos em ' + fmtData(empresa.docDPValidade));
    else if (docDP.classe === 'warn') avisos.push('Documentos DP ' + docDP.texto.toLowerCase());

    return { ok: motivos.length === 0, motivos, avisos, pendente: motivos.length === 0 && avisos.length > 0 };
  };

  getStatusSESMT = function(t) {
    const motivos = [];
    const avisos = [];
    const empresa = getEmpresaById(t.empresaId);

    const asoStatus = statusData(t.aso);
    if (asoStatus.semData) motivos.push('ASO sem data informada');
    else if (asoStatus.classe === 'blocked') motivos.push('ASO vencido em ' + fmtData(t.aso));
    else if (asoStatus.classe === 'warn') avisos.push('ASO ' + asoStatus.texto.toLowerCase());

    const integStatus = statusData(t.integ);
    if (integStatus.semData) avisos.push('Integração sem data informada');
    else if (integStatus.classe === 'blocked') motivos.push('Integração vencida em ' + fmtData(t.integ));
    else if (integStatus.classe === 'warn') avisos.push('Integração ' + integStatus.texto.toLowerCase());

    if (empresa) {
      const docSESMT = statusData(empresa.docSESMTValidade);
      if (docSESMT.semData) avisos.push('Documentos SESMT sem data informada');
      else if (docSESMT.classe === 'blocked') motivos.push('Documentos SESMT vencidos em ' + fmtData(empresa.docSESMTValidade));
      else if (docSESMT.classe === 'warn') avisos.push('Documentos SESMT ' + docSESMT.texto.toLowerCase());
    }

    // BPF integra a integração; treinamentos adicionais são apenas histórico.

    return { ok: motivos.length === 0, motivos, avisos, pendente: motivos.length === 0 && avisos.length > 0 };
  };

  getStatus = function(t) {
    const dp = getStatusDP(t);
    const sesmt = getStatusSESMT(t);
    const motivos = [...dp.motivos, ...sesmt.motivos];
    const avisos = [...dp.avisos, ...sesmt.avisos];
    const bloqueado = motivos.length > 0;
    const pendente = !bloqueado && avisos.length > 0;
    return { ok: !bloqueado, bloqueado, pendente, motivos, avisos, dp, sesmt };
  };

  const _renderDashboardV103 = renderDashboard;
  renderDashboard = function() {
    atualizarStats();
    const wrap = document.getElementById('dash-lista-bloqueados');
    if (!wrap) return;
    const itens = getAll().map(t => ({...t, status:getStatus(t)})).filter(t => t.status.bloqueado || t.status.pendente);
    if (!itens.length) {
      wrap.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhum terceiro bloqueado ou pendente no momento.</p>';
      return;
    }
    wrap.innerHTML = itens.map(t => {
      const resumo = (t.status.motivos.length ? t.status.motivos : t.status.avisos).slice(0,3).join('<br>');
      const classe = t.status.bloqueado ? 'dash-motivos' : 'dash-motivos warn';
      return `
        <div class="dash-item" role="button" tabindex="0" data-terceiro-id="${t.id}" style="cursor:pointer;">
          <div><strong>${escapeHtmlSafeV131(t.nome)}</strong><small>${escapeHtmlSafeV131(t.empresa || 'Sem empresa')} • ${t.cpf || 'CPF não informado'}</small></div>
          <div class="${classe}">${resumo}</div>
        </div>`;
    }).join('');
  };

  renderPendenciaItem = function(p, classe) {
    const quando = p.dias === null
      ? 'Sem data cadastrada'
      : (p.dias < 0 ? `Venceu em ${fmtData(p.vencimento)} (${Math.abs(p.dias)} dia(s) atrás)` : `Vence em ${fmtData(p.vencimento)} (faltam ${p.dias} dia(s))`);
    return `
      <div class="pendency-item" role="button" tabindex="0" data-terceiro-id="${p.terceiroId || ''}" style="cursor:pointer;">
        <div>
          <strong>${p.terceiro}</strong>
          <small>${p.empresa} • ${p.cpf}</small>
          <small>${p.tipo}: ${p.item}</small>
        </div>
        <div class="pendency-detail ${classe}">${quando}${p.detalheExtra ? '<br>' + p.detalheExtra : ''}</div>
      </div>`;
  };

  document.addEventListener('click', function(e) {
    const card = e.target.closest('.dash-item[data-terceiro-id], .pendency-item[data-terceiro-id]');
    if (!card) return;
    const id = card.getAttribute('data-terceiro-id');
    if (id) abrirAnalise(id);
  });

  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.dash-item[data-terceiro-id], .pendency-item[data-terceiro-id]');
    if (!card) return;
    e.preventDefault();
    const id = card.getAttribute('data-terceiro-id');
    if (id) abrirAnalise(id);
  });


  // ──────────────────────────────────────────────────
  //  V13 — Liberação por Exceção
  // ──────────────────────────────────────────────────
