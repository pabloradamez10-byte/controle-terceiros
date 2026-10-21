  function diffDias(iso) {
    if (!isDataValidaSistema(iso)) return null;
    const base = new Date(hoje() + 'T00:00:00');
    const alvo = new Date(iso + 'T00:00:00');
    return Math.ceil((alvo - base) / 86400000);
  }

  function montarPendencias() {
    const vencidas = [];
    const proximas = [];
    const semData = [];

    getAll().forEach(t => {
      const addPend = (tipo, item, vencimento, detalheExtra, origem) => {
        const pend = { terceiroId:t.id, terceiro:t.nome, empresa:t.empresa || 'Sem empresa', cpf:t.cpf || 'Sem CPF', tipo, item, vencimento, dias:null, detalheExtra:detalheExtra || '', origem:origem || '' };
        if (!isDataValidaSistema(vencimento)) {
          semData.push(pend);
          return;
        }
        const dias = diffDias(vencimento);
        pend.dias = dias;
        if (dias < 0) vencidas.push(pend);
        else if (dias <= 7) proximas.push(pend);
      };

      const empresaObj = getEmpresaById(t.empresaId);
      if (empresaObj) {
        addPend('DP', 'Fim da prestação de serviço', empresaObj.contratoFim, 'Regra da empresa: bloqueia todos os terceiros vinculados');
        addPend('DP', 'Documentos DP', empresaObj.docDPValidade, 'Documentação sob responsabilidade do DP');
        addPend('SESMT', 'Documentos SESMT da empresa', empresaObj.docSESMTValidade, 'Documentação da empresa sob responsabilidade do SESMT');
      } else {
        semData.push({ terceiroId:t.id, terceiro:t.nome, empresa:t.empresa || 'Sem empresa', cpf:t.cpf || 'Sem CPF', tipo:'DP', item:'Empresa vinculada', vencimento:'', dias:null, detalheExtra:'Cadastro sem empresa vinculada' });
      }

      addPend('SESMT', 'ASO', t.aso, 'Documento ocupacional');
      addPend('SESMT', 'Integração', t.integ, 'Integração obrigatória');


    });

    vencidas.sort((a,b) => (a.vencimento || '9999-99-99').localeCompare(b.vencimento || '9999-99-99'));
    proximas.sort((a,b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
    semData.sort((a,b) => (a.terceiro || '').localeCompare(b.terceiro || ''));
    return { vencidas, proximas, semData, total: vencidas.length + proximas.length + semData.length };
  }

  function renderPendenciaItem(p, classe) {
    const quando = p.dias === null
      ? 'Sem data cadastrada'
      : (p.dias < 0 ? `Venceu em ${fmtData(p.vencimento)} (${Math.abs(p.dias)} dia(s) atrás)` : `Vence em ${fmtData(p.vencimento)} (faltam ${p.dias} dia(s))`);
    return `
      <div class="pendency-item" role="button" tabindex="0" onclick="${p.terceiroId ? `abrirAnalise('${p.terceiroId}')` : ''}" onkeydown="if(event.key==='Enter'||event.key===' '){${p.terceiroId ? `abrirAnalise('${p.terceiroId}')` : ''}}">
        <div>
          <strong>${p.terceiro}</strong>
          <small>${p.empresa} • ${p.cpf}</small>
          <small>${p.tipo}: ${p.item}</small>
        </div>
        <div class="pendency-detail ${classe}">${quando}${p.detalheExtra ? '<br>' + p.detalheExtra : ''}</div>
      </div>`;
  }

  // V20 - Central de Pendências otimizada para celular.
  // Antes o sistema renderizava todas as pendências de uma vez, o que travava com bases grandes.
  const PENDENCIAS_PAGE_SIZE = 50;
  let pendenciasLimites = { vencidas: PENDENCIAS_PAGE_SIZE, proximas: PENDENCIAS_PAGE_SIZE, semData: PENDENCIAS_PAGE_SIZE };

  function resetPendenciasLimites() {
    pendenciasLimites = { vencidas: PENDENCIAS_PAGE_SIZE, proximas: PENDENCIAS_PAGE_SIZE, semData: PENDENCIAS_PAGE_SIZE };
  }

  function carregarMaisPendencias(tipo) {
    if (!pendenciasLimites[tipo]) pendenciasLimites[tipo] = PENDENCIAS_PAGE_SIZE;
    pendenciasLimites[tipo] += PENDENCIAS_PAGE_SIZE;
    renderPendencias(false);
  }

  function renderPendenciaLista(wrap, lista, classe, tipo, emptyText) {
    if (!wrap) return;
    if (!lista.length) {
      wrap.innerHTML = `<p style="font-size:14px;color:var(--muted);">${emptyText}</p>`;
      return;
    }

    const limite = pendenciasLimites[tipo] || PENDENCIAS_PAGE_SIZE;
    const visiveis = lista.slice(0, limite);
    const restante = Math.max(0, lista.length - visiveis.length);

    let html = visiveis.map(p => renderPendenciaItem(p, classe)).join('');
    if (restante > 0) {
      html += `
        <div style="display:flex;justify-content:center;margin-top:14px;">
          <button class="btn btn-ghost" onclick="carregarMaisPendencias('${tipo}')">
            Carregar mais ${Math.min(PENDENCIAS_PAGE_SIZE, restante)} de ${restante}
          </button>
        </div>`;
    }
    html += `<p style="font-size:12px;color:var(--muted);margin-top:10px;text-align:center;">Mostrando ${visiveis.length} de ${lista.length} registros.</p>`;
    wrap.innerHTML = html;
  }

  function renderPendencias(reset = true) {
    if (reset) resetPendenciasLimites();
    const dados = montarPendencias();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('pend-count-vencidos', dados.vencidas.length);
    set('pend-count-7dias', dados.proximas.length);
    set('pend-count-semdata', dados.semData.length);

    renderPendenciaLista(
      document.getElementById('pendencias-vencidas-list'),
      dados.vencidas,
      'danger',
      'vencidas',
      'Nenhuma pendência vencida encontrada.'
    );
    renderPendenciaLista(
      document.getElementById('pendencias-7dias-list'),
      dados.proximas,
      'warn',
      'proximas',
      'Nenhum vencimento nos próximos 7 dias.'
    );
    renderPendenciaLista(
      document.getElementById('pendencias-semdata-list'),
      dados.semData,
      'neutral',
      'semData',
      'Nenhum cadastro com data não informada.'
    );
  }

  // ──────────────────────────────────────────────────
  //  RESUMO / STATS
  // ──────────────────────────────────────────────────
