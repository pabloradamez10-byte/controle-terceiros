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
    const bloqueados = [];
    const aso = [];
    const integracao = [];
    const incompletos = [];

    getAll().forEach(t => {
      const empresaObj = getEmpresaById(t.empresaId);
      const empresaNome = t.empresa || empresaObj?.fantasia || empresaObj?.razao || 'Sem empresa';
      const baseCentral = { terceiroId:t.id, terceiro:t.nome || 'Sem nome', empresa:empresaNome, cpf:t.cpf || 'Sem CPF' };
      const addPend = (tipo, item, vencimento, detalheExtra, origem) => {
        const pend = { ...baseCentral, tipo, item, vencimento, dias:null, detalheExtra:detalheExtra || '', origem:origem || '' };
        if (!isDataValidaSistema(vencimento)) {
          pend.acao = `Completar a data obrigatória de ${item}.`;
          semData.push(pend);
          return;
        }
        const dias = diffDias(vencimento);
        pend.dias = dias;
        if (dias < 0) {
          pend.acao = `Atualizar ${item} com uma validade vigente.`;
          vencidas.push(pend);
        } else if (dias <= 7) {
          pend.acao = `Providenciar a renovação de ${item} antes do vencimento.`;
          proximas.push(pend);
        }
      };

      if (empresaObj) {
        addPend('DP', 'Fim da prestação de serviço', empresaObj.contratoFim, 'Regra da empresa: bloqueia todos os terceiros vinculados');
        addPend('DP', 'Documentos DP', empresaObj.docDPValidade, 'Documentação sob responsabilidade do DP');
        addPend('SESMT', 'Documentos SESMT da empresa', empresaObj.docSESMTValidade, 'Documentação da empresa sob responsabilidade do SESMT');
      } else {
        semData.push({ ...baseCentral, tipo:'DP', item:'Empresa vinculada', vencimento:'', dias:null, detalheExtra:'Cadastro sem empresa vinculada', acao:'Vincular o terceiro a uma empresa cadastrada.' });
      }

      addPend('SESMT', 'ASO', t.aso, 'Documento ocupacional');
      addPend('SESMT', 'Integração', t.integ, 'Integração obrigatória');

      const asoDias = diffDias(t.aso);
      if (!isDataValidaSistema(t.aso) || asoDias < 0) {
        aso.push({
          ...baseCentral,
          tipo:'SESMT',
          item:'ASO',
          mensagem:!isDataValidaSistema(t.aso) ? 'ASO sem data informada' : `ASO vencido em ${fmtData(t.aso)}`,
          acao:'Anexar/cadastrar um ASO válido e atualizar sua validade.'
        });
      }

      const integDias = diffDias(t.integ);
      if (!isDataValidaSistema(t.integ) || integDias < 0) {
        integracao.push({
          ...baseCentral,
          tipo:'SESMT',
          item:'Integração',
          mensagem:!isDataValidaSistema(t.integ) ? 'Integração sem data informada' : `Integração vencida em ${fmtData(t.integ)}`,
          acao:'Realizar/renovar a integração e atualizar sua validade.'
        });
      }

      const faltantes = [];
      if (!String(t.nome || '').trim()) faltantes.push('nome');
      if (!String(t.cpf || '').trim()) faltantes.push('CPF');
      if (!t.empresaId) faltantes.push('empresa');
      if (!String(t.funcao || '').trim()) faltantes.push('função');
      if (faltantes.length) {
        incompletos.push({
          ...baseCentral,
          tipo:'Cadastro',
          item:'Cadastro incompleto',
          mensagem:`Faltando: ${faltantes.join(', ')}`,
          acao:'Completar os campos obrigatórios do cadastro.'
        });
      }

      if (typeof getStatus === 'function') {
        const status = getStatus(t);
        if (status.bloqueado) {
          bloqueados.push({
            ...baseCentral,
            tipo:'Acesso',
            item:'Bloqueado',
            mensagem:status.motivos.join(' • ') || 'Terceiro bloqueado',
            acao:'Regularizar os motivos de bloqueio antes de liberar a entrada.'
          });
        }
      }
    });

    vencidas.sort((a,b) => (a.vencimento || '9999-99-99').localeCompare(b.vencimento || '9999-99-99'));
    proximas.sort((a,b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
    semData.sort((a,b) => (a.terceiro || '').localeCompare(b.terceiro || ''));
    const byName = (a,b) => (a.terceiro || '').localeCompare(b.terceiro || '');
    bloqueados.sort(byName); aso.sort(byName); integracao.sort(byName); incompletos.sort(byName);
    return {
      vencidas, proximas, semData, bloqueados, aso, integracao, incompletos,
      total: vencidas.length + proximas.length + semData.length
    };
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
  let centralPendenciasTipo = 'bloqueados';

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

  function ensureCentralPendenciasResumo() {
    const page = document.getElementById('page-pendencias');
    if (!page) return null;
    let box = document.getElementById('central-pendencias-resumo');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'central-pendencias-resumo';
    box.className = 'card';
    box.style.padding = '18px 20px';
    const tabs = page.querySelector('.pendency-tabs');
    if (tabs) tabs.insertAdjacentElement('afterend', box);
    else page.querySelector('.page-actions')?.insertAdjacentElement('afterend', box);
    return box;
  }

  function centralCard(label, value, tipo, tone) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pendency-pill ${tone || 'neutral'}`;
    button.style.cursor = 'pointer';
    button.style.border = '0';
    button.style.minHeight = '58px';
    button.setAttribute('aria-pressed', centralPendenciasTipo === tipo ? 'true' : 'false');
    button.addEventListener('click', () => {
      centralPendenciasTipo = tipo;
      renderPendencias(false);
    });
    const labelNode = document.createElement('span');
    labelNode.textContent = `${label}: `;
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    labelNode.appendChild(strong);
    button.appendChild(labelNode);
    return button;
  }

  function renderCentralPendenciasDetalhe(box, dados) {
    const labels = {
      bloqueados:'Bloqueados agora',
      aso:'ASO pendente ou vencido',
      integracao:'Integração pendente ou vencida',
      vencidas:'Documentos vencidos',
      proximas:'Vencem em até 7 dias',
      incompletos:'Cadastros incompletos'
    };
    const empty = {
      bloqueados:'Nenhum terceiro bloqueado.',
      aso:'Nenhuma pendência de ASO.',
      integracao:'Nenhuma pendência de integração.',
      vencidas:'Nenhum documento vencido.',
      proximas:'Nenhum vencimento nos próximos 7 dias.',
      incompletos:'Nenhum cadastro incompleto.'
    };
    const lista = dados[centralPendenciasTipo] || [];
    const limite = pendenciasLimites[centralPendenciasTipo] || PENDENCIAS_PAGE_SIZE;
    const visiveis = lista.slice(0, limite);
    const detail = document.createElement('div');
    detail.style.marginTop = '16px';
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = `${labels[centralPendenciasTipo] || 'Pendências'} (${lista.length})`;
    detail.appendChild(title);
    if (!visiveis.length) {
      const p = document.createElement('p');
      p.style.cssText = 'font-size:14px;color:var(--muted);';
      p.textContent = empty[centralPendenciasTipo] || 'Nenhuma pendência.';
      detail.appendChild(p);
    } else {
      visiveis.forEach(item => {
        const row = document.createElement('div');
        row.className = 'pendency-item';
        row.tabIndex = 0;
        row.setAttribute('role','button');
        row.style.cursor = 'pointer';
        const open = () => item.terceiroId && abrirAnalise(item.terceiroId);
        row.addEventListener('click', open);
        row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
        const who = document.createElement('div');
        const strong = document.createElement('strong'); strong.textContent = item.terceiro || 'Sem nome';
        const small1 = document.createElement('small'); small1.textContent = `${item.empresa || 'Sem empresa'} • ${item.cpf || 'Sem CPF'}`;
        const small2 = document.createElement('small'); small2.textContent = `${item.tipo || 'Pendência'}: ${item.item || ''}`;
        who.append(strong, small1, small2);
        const why = document.createElement('div');
        why.className = `pendency-detail ${centralPendenciasTipo === 'proximas' ? 'warn' : centralPendenciasTipo === 'incompletos' ? 'neutral' : 'danger'}`;
        if (item.mensagem) why.append(document.createTextNode(item.mensagem));
        else if (item.dias === null) why.append(document.createTextNode('Sem data cadastrada'));
        else if (item.dias < 0) why.append(document.createTextNode(`Venceu em ${fmtData(item.vencimento)} (${Math.abs(item.dias)} dia(s) atrás)`));
        else why.append(document.createTextNode(`Vence em ${fmtData(item.vencimento)} (faltam ${item.dias} dia(s))`));
        const action = document.createElement('small');
        action.style.display = 'block';
        action.style.marginTop = '5px';
        action.textContent = `Ação necessária: ${item.acao || 'Revisar e regularizar a pendência.'}`;
        why.appendChild(action);
        row.append(who, why);
        detail.appendChild(row);
      });
      const restante = Math.max(0, lista.length - visiveis.length);
      if (restante > 0) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'btn btn-ghost';
        more.style.marginTop = '12px';
        more.textContent = `Carregar mais ${Math.min(PENDENCIAS_PAGE_SIZE, restante)} de ${restante}`;
        more.addEventListener('click', () => carregarMaisPendencias(centralPendenciasTipo));
        detail.appendChild(more);
      }
    }
    box.appendChild(detail);
  }

  function renderCentralPendenciasResumo(dados) {
    const box = ensureCentralPendenciasResumo();
    if (!box) return;
    box.replaceChildren();
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = 'Visão rápida — toque para abrir a lista';
    box.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'pendency-tabs';
    grid.append(
      centralCard('Bloqueados', dados.bloqueados.length, 'bloqueados', 'danger'),
      centralCard('ASO pendente/vencido', dados.aso.length, 'aso', 'danger'),
      centralCard('Integração pendente/vencida', dados.integracao.length, 'integracao', 'warn'),
      centralCard('Documentos vencidos', dados.vencidas.length, 'vencidas', 'danger'),
      centralCard('Vencem em até 7 dias', dados.proximas.length, 'proximas', 'warn'),
      centralCard('Cadastros incompletos', dados.incompletos.length, 'incompletos', 'neutral')
    );
    box.appendChild(grid);
    renderCentralPendenciasDetalhe(box, dados);
  }

  function renderPendencias(reset = true) {
    if (reset) resetPendenciasLimites();
    const dados = montarPendencias();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('pend-count-vencidos', dados.vencidas.length);
    set('pend-count-7dias', dados.proximas.length);
    set('pend-count-semdata', dados.semData.length);

    renderCentralPendenciasResumo(dados);
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
