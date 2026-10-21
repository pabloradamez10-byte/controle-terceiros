
  // ──────────────────────────────────────────────────
  //  STORAGE
  // ──────────────────────────────────────────────────
  function getAll() {
    return JSON.parse(localStorage.getItem('terceiros') || '[]');
  }

  function saveAll(data) {
    localStorage.setItem('terceiros', JSON.stringify(data));
  }

  function normalizarBuscaSST(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  function correspondeBuscaSST(query, textos, documentos) {
    const q = normalizarBuscaSST(query);
    if (!q) return true;
    const digits = q.replace(/\D/g, '');
    if (digits && /^[\d\s.\-/]+$/.test(q)) {
      return (documentos || []).some(value => String(value ?? '').replace(/\D/g, '').includes(digits));
    }
    const text = normalizarBuscaSST([...(textos || []), ...(documentos || [])].filter(value => value != null).join(' '));
    return q.split(' ').every(word => text.includes(word));
  }

  function correspondeBuscaTerceiroSST(query, terceiro) {
    const q = normalizarBuscaSST(query);
    if (!q) return true;
    const digits = q.replace(/\D/g, '');
    if (digits && /^[\d\s.\-/]+$/.test(q)) {
      return String(terceiro.cpf ?? '').replace(/\D/g, '').includes(digits);
    }
    const words = value => normalizarBuscaSST(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
    const nome = words(terceiro.nome), busca = words(q);
    if (!busca) return false;
    // Palavras concluídas são exatas; a última pode ser um sobrenome em digitação.
    const nameWords = nome.split(' '), queryWords = busca.split(' ');
    if (queryWords.length === 1) return nameWords.includes(busca);
    if (nome === busca) return true;
    return queryWords.every((part, index) => {
      const current = nameWords[index];
      if (!current) return false;
      if (index !== queryWords.length - 1) return current === part;
      return current.startsWith(part) && (current !== part || nameWords.length === queryWords.length);
    });
  }

  // ──────────────────────────────────────────────────
  //  UTILS
  // ──────────────────────────────────────────────────
  function hoje() {
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }

  function isDataValidaSistema(iso) {
    if (!iso || typeof iso !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return false;
    // Datas muito antigas geralmente vêm de planilhas com campo vazio/erro de conversão.
    if (y < 2000) return false;
    const dt = new Date(iso + 'T00:00:00');
    return dt instanceof Date && !isNaN(dt) && dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
  }

  function fmtData(iso) {
    if (!isDataValidaSistema(iso)) return 'Data não informada';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function addMonths(iso, months) {
    if (!isDataValidaSistema(iso)) return '';
    const d = new Date(iso + 'T00:00:00');
    d.setMonth(d.getMonth() + Number(months || 12));
    return d.toISOString().split('T')[0];
  }

  function getEmpresaById(id) {
    return (typeof getAllEmpresas === 'function' ? getAllEmpresas() : []).find(e => e.id === id);
  }

  function getTreinamentoById(id) {
    return (typeof getAllTreinamentos === 'function' ? getAllTreinamentos() : []).find(t => t.id === id);
  }

  function getTreinosObrigatoriosDaEmpresa(empresaId) {
    const empresa = getEmpresaById(empresaId);
    const ids = empresa?.treinamentosObrigatorios || [];
    return (typeof getAllTreinamentos === 'function' ? getAllTreinamentos() : [])
      .filter(tr => ids.includes(tr.id) && tr.ativo !== false);
  }

  function getTreinoRealizado(terceiro, treinamentoId) {
    const lista = terceiro?.treinamentosRealizados || [];
    return lista.find(x => x.treinamentoId === treinamentoId);
  }

  function getStatusTreinamentoTerceiro(terceiro, treinamento) {
    const reg = getTreinoRealizado(terceiro, treinamento.id);
    if (!reg || !isDataValidaSistema(reg.data)) return { ok:false, label:'Sem data', motivo:`${treinamento.nome} sem data cadastrada`, semData:true };
    const venc = addMonths(reg.data, treinamento.validade || 12);
    if (!isDataValidaSistema(venc)) return { ok:false, label:'Sem data', motivo:`${treinamento.nome} com data inválida`, semData:true };
    if (venc < hoje()) return { ok:false, label:'Vencido', motivo:`${treinamento.nome} vencido em ${fmtData(venc)}`, vencimento:venc };
    return { ok:true, label:'OK', motivo:'', vencimento:venc };
  }

  function statusData(iso) {
    if (!isDataValidaSistema(iso)) return { classe:'neutral', label:'Sem data', texto:'Data não informada', dias:null, semData:true };
    const dias = diffDias(iso);
    if (dias < 0) return { classe:'blocked', label:'Vencido', texto:`Vencido em ${fmtData(iso)}`, dias };
    if (dias <= 30) return { classe:'warn', label:'Vencendo', texto:`Vence em ${fmtData(iso)} (${dias} dia(s))`, dias };
    return { classe:'ok', label:'OK', texto:`Válido até ${fmtData(iso)}`, dias };
  }

  function badgeStatus(label, classe) {
    const cls = classe === 'blocked' ? 'badge-blocked' : (classe === 'warn' ? 'badge-warn' : 'badge-ok');
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function tagData(iso) {
    const st = statusData(iso);
    if (st.semData) return `<span class="tag-warn">SEM DATA</span>`;
    const cls = st.classe === 'blocked' ? 'tag-venc' : (st.classe === 'warn' ? 'tag-warn' : 'tag-ok');
    const label = st.classe === 'blocked' ? 'VENCIDO' : (st.classe === 'warn' ? 'VENCE' : 'OK');
    return `<span class="${cls}">${label}</span>`;
  }

  function getStatusDP(t) {
    const motivos = [];
    const avisos = [];
    const empresa = getEmpresaById(t.empresaId);
    if (!empresa) {
      motivos.push('Empresa não vinculada ao cadastro');
      return { ok:false, motivos, avisos };
    }

    const contrato = statusData(empresa.contratoFim);
    if (contrato.semData) avisos.push('Fim da prestação de serviço sem data informada');
    else if (contrato.classe === 'blocked') motivos.push('Fim da prestação de serviço vencido em ' + fmtData(empresa.contratoFim));
    else if (contrato.classe === 'warn') avisos.push('Fim da prestação de serviço ' + contrato.texto.toLowerCase());

    const docDP = statusData(empresa.docDPValidade);
    if (docDP.semData) avisos.push('Documentos DP sem data informada');
    else if (docDP.classe === 'blocked') motivos.push('Documentos DP vencidos em ' + fmtData(empresa.docDPValidade));
    else if (docDP.classe === 'warn') avisos.push('Documentos DP ' + docDP.texto.toLowerCase());

    return { ok: motivos.length === 0, motivos, avisos };
  }

  function getStatusSESMT(t) {
    const h = hoje();
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

    const obrigatorios = getTreinosObrigatoriosDaEmpresa(t.empresaId);
    obrigatorios.forEach(tr => {
      const st = getStatusTreinamentoTerceiro(t, tr);
      if (!st.ok && st.semData) avisos.push(st.motivo);
      else if (!st.ok) motivos.push(st.motivo);
      else if (st.vencimento && statusData(st.vencimento).classe === 'warn') avisos.push(`${tr.nome} ${statusData(st.vencimento).texto.toLowerCase()}`);
    });

    return { ok: motivos.length === 0, motivos, avisos };
  }

  function getStatus(t) {
    const dp = getStatusDP(t);
    const sesmt = getStatusSESMT(t);
    const motivos = [...dp.motivos, ...sesmt.motivos];
    const avisos = [...dp.avisos, ...sesmt.avisos];
    return { ok: motivos.length === 0, motivos, avisos, dp, sesmt };
  }

  function maskCPF(v) {
    v = v.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9) v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2})$/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/^(\d{3})(\d{3})(\d{1,3})$/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/^(\d{3})(\d{1,3})$/, '$1.$2');
    return v;
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ──────────────────────────────────────────────────
  //  NAVEGAÇÃO
  // ──────────────────────────────────────────────────
  function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('nav button').forEach((b, i) => {
      const pages = ['dashboard','cadastro','listagem','empresas','treinamentos','dados','portaria'];
      b.classList.toggle('active', pages[i] === name);
    });
    document.getElementById('page-' + name).classList.add('active');
    if (name === 'dashboard') renderDashboard();
    if (name === 'pendencias') renderPendencias();
    if (name === 'listagem') renderLista();
    if (name === 'empresas') renderEmpresas();
    if (name === 'treinamentos') renderTreinamentos();
    if (name === 'dados') renderDados();
    if (name === 'cadastro') { popularSelectEmpresas('f-empresa'); renderTreinosExigidosCadastro(); }
  }

  // ──────────────────────────────────────────────────
  //  CPF MASK
  // ──────────────────────────────────────────────────
  document.getElementById('f-cpf').addEventListener('input', function() {
    this.value = maskCPF(this.value);
  });
  document.getElementById('e-cpf').addEventListener('input', function() {
    this.value = maskCPF(this.value);
  });
  document.getElementById('f-empresa').addEventListener('change', renderTreinosExigidosCadastro);
  document.getElementById('e-empresa').addEventListener('change', function(){ renderTreinosEdicao(); });



  function coletarTreinamentosDoFormulario(prefixo) {
    return Array.from(document.querySelectorAll(`.${prefixo}-treino-data`))
      .map(input => ({ treinamentoId: input.dataset.treinamentoId, data: input.value }))
      .filter(x => x.treinamentoId && x.data);
  }

  function renderCamposTreinamentos(containerId, empresaId, realizados, classeInput) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    const obrigatorios = getTreinosObrigatoriosDaEmpresa(empresaId);
    realizados = realizados || [];

    if (!empresaId) {
      wrap.innerHTML = '<p style="font-size:13px;color:var(--muted);">Selecione uma empresa para visualizar os treinamentos adicionais.</p>';
      return;
    }

    if (!obrigatorios.length) {
      wrap.innerHTML = '<p style="font-size:13px;color:var(--muted);">Esta empresa não possui treinamentos adicionais vinculados.</p>';
      return;
    }

    wrap.innerHTML = obrigatorios.map(tr => {
      const reg = realizados.find(x => x.treinamentoId === tr.id) || {};
      const venc = reg.data ? addMonths(reg.data, tr.validade || 12) : '';
      const status = '<span class="status-mini">' + (reg.data ? 'Registrado' : 'Opcional') + '</span>';
      return `
        <div class="training-date-card">
          <strong>${tr.nome} ${status}</strong>
          <input type="date" class="${classeInput}" data-treinamento-id="${tr.id}" value="${reg.data || ''}">
          <small>Validade: ${tr.validade || 12} meses${venc ? ' | Vence em ' + fmtData(venc) : ''}</small>
        </div>`;
    }).join('');
  }

  // ──────────────────────────────────────────────────
  //  CADASTRO
  // ──────────────────────────────────────────────────
  function salvarTerceiro() {
    const nome   = document.getElementById('f-nome').value.trim();
    const cpf    = document.getElementById('f-cpf').value.trim();
    const empSel = document.getElementById('f-empresa');
    const empresaId = empSel.value;
    const empresa = empSel.options[empSel.selectedIndex]?.text || '';
    const funcao = document.getElementById('f-funcao').value.trim();
    const aso    = document.getElementById('f-aso').value;
    const integ  = document.getElementById('f-integ').value;
    const obs    = document.getElementById('f-obs').value.trim();
    const treinamentosRealizados = coletarTreinamentosDoFormulario('f');

    if (!nome || !cpf || !empresaId || !funcao || !aso || !integ) {
      toast('⚠ Preencha todos os campos obrigatórios.');
      return;
    }

    const lista = getAll();
    const cpfLimpo = cpf.replace(/\D/g, '');
    const duplicado = lista.find(t => t.cpf.replace(/\D/g, '') === cpfLimpo);
    if (duplicado) {
      toast('⚠ Já existe um terceiro com este CPF.');
      return;
    }

    lista.push({ id: uid(), nome, cpf, empresaId, empresa, funcao, aso, integ, obs, treinamentosRealizados });
    saveAll(lista);
    limparForm();
    toast('✓ Terceiro cadastrado com sucesso!');
  }

  function limparForm() {
    ['f-nome','f-cpf','f-empresa','f-funcao','f-aso','f-integ','f-obs'].forEach(id => {
      document.getElementById(id).value = '';
    });
    renderTreinosExigidosCadastro();
  }

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
  function atualizarStats() {
    const terceiros = getAll();
    const empresas = (typeof getAllEmpresas === 'function') ? getAllEmpresas() : [];
    const treinamentos = (typeof getAllTreinamentos === 'function') ? getAllTreinamentos() : [];
    const liberados = terceiros.filter(t => getStatus(t).ok).length;
    const bloqueados = terceiros.length - liberados;
    const pendenciasTreino = contarTreinamentosRegistrados(terceiros);
    const empresasComExigencias = empresas.filter(e => (e.treinamentosObrigatorios || []).length > 0).length;
    const pendenciasGerais = montarPendencias().total;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('stat-total', terceiros.length);
    set('stat-liberados', liberados);
    set('stat-bloqueados', bloqueados);
    set('stat-empresas', empresas.length);
    set('stat-pendencias-treino', pendenciasTreino);

    set('dash-total', terceiros.length);
    set('dash-liberados', liberados);
    set('dash-bloqueados', bloqueados);
    set('dash-empresas', empresas.length);
    set('dash-pendencias', pendenciasGerais);
    set('dash-treinamentos', treinamentos.length);
    set('dash-empresas-exigencias', empresasComExigencias);
    set('dash-status-geral', bloqueados === 0 ? 'OK' : 'ATENÇÃO');
  }

  function renderDashboard() {
    atualizarStats();
    const wrap = document.getElementById('dash-lista-bloqueados');
    if (!wrap) return;
    const bloqueados = getAll().map(t => ({...t, status:getStatus(t)})).filter(t => !t.status.ok);
    if (!bloqueados.length) {
      wrap.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhum terceiro bloqueado ou pendente no momento.</p>';
      return;
    }
    wrap.innerHTML = bloqueados.map(t => `
      <div class="dash-item" role="button" tabindex="0" onclick="abrirAnalise('${t.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){abrirAnalise('${t.id}')}">
        <div><strong>${escapeHtmlSafeV131(t.nome)}</strong><small>${escapeHtmlSafeV131(t.empresa || 'Sem empresa')} • ${t.cpf || 'CPF não informado'}</small></div>
        <div class="dash-motivos">${t.status.motivos.slice(0,3).join('<br>')}</div>
      </div>`).join('');
  }

  // ──────────────────────────────────────────────────
  //  LISTAGEM
  // ──────────────────────────────────────────────────
  function renderLista() {
    atualizarStats();
    const q = document.getElementById('busca-lista').value.toLowerCase().trim();
    let lista = getAll();
    if (q) lista = lista.filter(t => correspondeBuscaTerceiroSST(q, t));

    const tbody = document.getElementById('tabela-body');
    const empty = document.getElementById('lista-empty');
    tbody.innerHTML = '';

    if (!lista.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    lista.forEach(t => {
      const { ok, motivos } = getStatus(t);
      const badge = ok
        ? `<span class="badge badge-ok">✓ Liberado</span>`
        : `<span class="badge badge-blocked">✕ Bloqueado</span>`;
      const h = hoje();
      const asoTag  = t.aso  < h ? `<span class="tag-venc">VENCIDO</span>` : `<span class="tag-ok">OK</span>`;
      const integTag= t.integ< h ? `<span class="tag-venc">VENCIDO</span>` : `<span class="tag-ok">OK</span>`;
      const obrig = getTreinosObrigatoriosDaEmpresa(t.empresaId);
      const pend = obrig.filter(tr => !getStatusTreinamentoTerceiro(t, tr).ok).length;
      const treinoBadge = badgeTreinamentosComplementares(t);
      const stDP = getStatusDP(t);
      const stSESMT = getStatusSESMT(t);
      const dpBadge = stDP.ok ? '<span class="badge badge-ok">DP OK</span>' : '<span class="badge badge-blocked">DP Bloq.</span>';
      const sesmtBadge = stSESMT.ok ? '<span class="badge badge-ok">SESMT OK</span>' : '<span class="badge badge-blocked">SESMT Bloq.</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-name">${escapeHtmlSafeV131(t.nome)}</td>
        <td class="td-cpf">${escapeHtmlSafeV131(t.cpf)}</td>
        <td class="td-company">${t.empresa}</td>
        <td>${fmtData(t.aso)}${asoTag}</td>
        <td>${fmtData(t.integ)}${integTag}</td>
        <td>${treinoBadge}</td>
        <td>${dpBadge}</td>
        <td>${sesmtBadge}</td>
        <td>${badge}</td>
        <td>
          <div class="actions">
            <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px;" onclick="abrirAnalise('${t.id}')">Analisar</button>
            <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px;" onclick="abrirEdicao('${t.id}')">Editar</button>
            <button class="btn btn-danger" style="padding:5px 12px;font-size:12px;" onclick="excluir('${t.id}')">Excluir</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  function excluir(id) {
    if (!confirm('Deseja excluir este terceiro?')) return;
    saveAll(getAll().filter(t => t.id !== id));
    renderLista();
    toast('Terceiro removido.');
  }

  // ──────────────────────────────────────────────────
  //  EDIÇÃO
  // ──────────────────────────────────────────────────
  function abrirEdicao(id) {
    const t = getAll().find(t => t.id === id);
    if (!t) return;
    popularSelectEmpresas('e-empresa', t.empresaId || '');
    document.getElementById('e-id').value     = t.id;
    document.getElementById('e-nome').value   = t.nome;
    document.getElementById('e-cpf').value    = t.cpf;
    if (!t.empresaId && t.empresa) {
      const sel = document.getElementById('e-empresa');
      const opt = Array.from(sel.options).find(o => o.textContent === t.empresa);
      if (opt) sel.value = opt.value;
    }
    document.getElementById('e-funcao').value = t.funcao;
    document.getElementById('e-aso').value    = t.aso;
    document.getElementById('e-integ').value  = t.integ;
    document.getElementById('e-obs').value    = t.obs;
    renderTreinosEdicao(t);
    document.getElementById('modal').classList.add('open');
  }

  function fecharModal() {
    document.getElementById('modal').classList.remove('open');
  }

  function renderTreinosEdicao(terceiro) {
    const sel = document.getElementById('e-empresa');
    const empresaId = sel ? sel.value : '';
    const realizados = terceiro?.treinamentosRealizados || [];
    renderCamposTreinamentos('e-treinos-box', empresaId, realizados, 'e-treino-data');
  }

  function salvarEdicao() {
    const id     = document.getElementById('e-id').value;
    const nome   = document.getElementById('e-nome').value.trim();
    const cpf    = document.getElementById('e-cpf').value.trim();
    const empSel = document.getElementById('e-empresa');
    const empresaId = empSel.value;
    const empresa = empSel.options[empSel.selectedIndex]?.text || '';
    const funcao = document.getElementById('e-funcao').value.trim();
    const aso    = document.getElementById('e-aso').value;
    const integ  = document.getElementById('e-integ').value;
    const obs    = document.getElementById('e-obs').value.trim();
    const treinamentosRealizados = coletarTreinamentosDoFormulario('e');

    if (!nome || !cpf || !empresaId || !funcao || !aso || !integ) {
      toast('⚠ Preencha todos os campos obrigatórios.'); return;
    }

    const lista = getAll().map(t => t.id === id ? { ...t, nome, cpf, empresaId, empresa, funcao, aso, integ, obs, treinamentosRealizados } : t);
    saveAll(lista);
    fecharModal();
    renderLista();
    toast('✓ Alterações salvas!');
  }

  // fechar modal ao clicar fora
  document.getElementById('modal').addEventListener('click', function(e) {
    if (e.target === this) fecharModal();
  });



  // ──────────────────────────────────────────────────
  //  TREINAMENTOS — CATÁLOGO PADRÃO
  // ──────────────────────────────────────────────────
  const TREINAMENTOS_PADRAO = [
    'Integração', 'Política de SST', 'Uso de EPIs', 'NR 01', 'NR 05 - CIPA', 'NR 06 - EPI',
    'NR 10 Básico', 'NR 10 SEP', 'NR 11 - Empilhadeira', 'NR 11 - Ponte Rolante',
    'NR 12 - Máquinas e Equipamentos', 'NR 13 - Caldeiras e Vasos de Pressão',
    'NR 18 - Construção Civil', 'NR 20 - Inflamáveis e Combustíveis',
    'NR 23 - Combate a Incêndio', 'NR 33 - Trabalhador Autorizado', 'NR 33 - Vigia',
    'NR 33 - Supervisor', 'NR 35 - Trabalho em Altura', 'Brigada de Incêndio',
    'Primeiros Socorros', 'Direção Defensiva', 'Operador de PTA', 'Operador de Munck',
    'Operador de Guindaste', 'Operador de Retroescavadeira', 'Operador de Escavadeira',
    'Soldagem', 'Trabalho a Quente'
  ];

  function getAllTreinamentos() {
    return JSON.parse(localStorage.getItem('treinamentos') || '[]');
  }

  function saveAllTreinamentos(data) {
    localStorage.setItem('treinamentos', JSON.stringify(data));
  }

  function inicializarTreinamentosPadrao() {
    const atuais = getAllTreinamentos();
    if (atuais.length) return;
    const padrao = TREINAMENTOS_PADRAO.map(nome => ({ id: uid(), nome, validade: 12, ativo: true }));
    saveAllTreinamentos(padrao);
  }

  function treinamentosAtivos() {
    return getAllTreinamentos().filter(t => t.ativo !== false);
  }

  function abrirModalNovoTreinamento() {
    document.getElementById('modal-treinamento-title').textContent = 'Novo Treinamento';
    document.getElementById('tr-id').value = '';
    document.getElementById('tr-nome').value = '';
    document.getElementById('tr-validade').value = 12;
    document.getElementById('tr-ativo').value = 'sim';
    document.getElementById('modal-treinamento').classList.add('open');
  }

  function abrirModalEditarTreinamento(id) {
    const t = getAllTreinamentos().find(t => t.id === id);
    if (!t) return;
    document.getElementById('modal-treinamento-title').textContent = 'Editar Treinamento';
    document.getElementById('tr-id').value = t.id;
    document.getElementById('tr-nome').value = t.nome;
    document.getElementById('tr-validade').value = t.validade || 12;
    document.getElementById('tr-ativo').value = t.ativo === false ? 'nao' : 'sim';
    document.getElementById('modal-treinamento').classList.add('open');
  }

  function fecharModalTreinamento() {
    document.getElementById('modal-treinamento').classList.remove('open');
  }

  document.getElementById('modal-treinamento').addEventListener('click', function(e) {
    if (e.target === this) fecharModalTreinamento();
  });

  function salvarTreinamento() {
    const id = document.getElementById('tr-id').value;
    const nome = document.getElementById('tr-nome').value.trim();
    const validade = parseInt(document.getElementById('tr-validade').value, 10);
    const ativo = document.getElementById('tr-ativo').value === 'sim';

    if (!nome || !validade || validade < 1) {
      toast('⚠ Informe nome e validade do treinamento.');
      return;
    }

    let lista = getAllTreinamentos();
    const nomeNorm = nome.toLowerCase();
    const duplicado = lista.find(t => t.nome.toLowerCase() === nomeNorm && t.id !== id);
    if (duplicado) {
      toast('⚠ Já existe um treinamento com este nome.');
      return;
    }

    if (id) {
      lista = lista.map(t => t.id === id ? { ...t, nome, validade, ativo } : t);
      toast('✓ Treinamento atualizado!');
    } else {
      lista.push({ id: uid(), nome, validade, ativo });
      toast('✓ Treinamento cadastrado!');
    }
    saveAllTreinamentos(lista);
    fecharModalTreinamento();
    renderTreinamentos();
    renderChecklistTreinamentosEmpresa();
    renderTreinosExigidosCadastro();
  }

  function alternarTreinamento(id) {
    const lista = getAllTreinamentos().map(t => t.id === id ? { ...t, ativo: !(t.ativo !== false) } : t);
    saveAllTreinamentos(lista);
    renderTreinamentos();
    renderChecklistTreinamentosEmpresa();
    renderTreinosExigidosCadastro();
  }

  function renderTreinamentos() {
    const q = (document.getElementById('busca-treinamentos')?.value || '').toLowerCase().trim();
    let lista = getAllTreinamentos();
    if (q) lista = lista.filter(t => t.nome.toLowerCase().includes(q));

    const tbody = document.getElementById('tabela-treinamentos');
    const empty = document.getElementById('treinamentos-empty');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!lista.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    lista.forEach(t => {
      const ativo = t.ativo !== false;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-name">${escapeHtmlSafeV131(t.nome)}</td>
        <td>${t.validade || 12} meses</td>
        <td>${ativo ? '<span class="badge badge-ok">Ativo</span>' : '<span class="badge badge-blocked">Inativo</span>'}</td>
        <td>
          <div class="actions">
            <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px;" onclick="abrirModalEditarTreinamento('${t.id}')">Editar</button>
            <button class="btn ${ativo ? 'btn-danger' : 'btn-ghost'}" style="padding:5px 12px;font-size:12px;" onclick="alternarTreinamento('${t.id}')">${ativo ? 'Desativar' : 'Ativar'}</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  function renderChecklistTreinamentosEmpresa(selectedIds) {
    const wrap = document.getElementById('emp-treinamentos-checklist');
    if (!wrap) return;
    selectedIds = selectedIds || [];
    const lista = treinamentosAtivos();
    if (!lista.length) {
      wrap.innerHTML = '<p style="font-size:13px;color:var(--muted);">Nenhum treinamento ativo encontrado.</p>';
      return;
    }
    wrap.innerHTML = lista.map(t => `
      <label class="check-card">
        <input type="checkbox" class="emp-treino-check" value="${t.id}" ${selectedIds.includes(t.id) ? 'checked' : ''}>
        <span><strong>${escapeHtmlSafeV131(t.nome)}</strong><small>Validade padrão: ${t.validade || 12} meses</small></span>
      </label>`).join('');
  }

  function getTreinamentosSelecionadosEmpresa() {
    return Array.from(document.querySelectorAll('.emp-treino-check:checked')).map(c => c.value);
  }

  function renderTreinosExigidosCadastro() {
    const sel = document.getElementById('f-empresa');
    const box = document.getElementById('treinos-exigidos-box');
    const list = document.getElementById('treinos-exigidos-list');
    if (!sel || !box || !list) return;

    if (!sel.value) {
      box.classList.remove('show');
      list.innerHTML = '';
      return;
    }

    box.classList.add('show');
    renderCamposTreinamentos('treinos-exigidos-list', sel.value, [], 'f-treino-data');
  }

  // ──────────────────────────────────────────────────
  //  EMPRESAS — STORAGE
  // ──────────────────────────────────────────────────
  function getAllEmpresas() {
    return JSON.parse(localStorage.getItem('empresas') || '[]');
  }

  function saveAllEmpresas(data) {
    localStorage.setItem('empresas', JSON.stringify(data));
  }

  function popularSelectEmpresas(selectId, selectedId) {
    const sel = document.getElementById(selectId || 'f-empresa');
    if (!sel) return;
    const empresas = getAllEmpresas();
    sel.innerHTML = '<option value="">Selecione uma empresa...</option>';
    empresas.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.fantasia ? `${e.razao} (${e.fantasia})` : e.razao;
      if (selectedId && e.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function maskCNPJ(v) {
    v = v.replace(/\D/g, '').slice(0, 14);
    if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})$/, '$1.$2.$3/$4-$5');
    else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{1,4})$/, '$1.$2.$3/$4');
    else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{1,3})$/, '$1.$2.$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{1,3})$/, '$1.$2');
    return v;
  }

  function maskTel(v) {
    v = v.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
    return v;
  }

  document.getElementById('emp-cnpj').addEventListener('input', function() { this.value = maskCNPJ(this.value); });
  document.getElementById('emp-tel').addEventListener('input',  function() { this.value = maskTel(this.value); });

  function abrirModalNovaEmpresa() {
    document.getElementById('modal-empresa-title').textContent = 'Nova Empresa';
    document.getElementById('emp-id').value = '';
    ['emp-razao','emp-fantasia','emp-cnpj','emp-resp','emp-tel','emp-email','emp-contrato-inicio','emp-contrato-fim','emp-doc-dp','emp-doc-sesmt'].forEach(id => {
      document.getElementById(id).value = '';
    });
    renderChecklistTreinamentosEmpresa([]);
    document.getElementById('modal-empresa').classList.add('open');
  }

  function abrirModalEditarEmpresa(id) {
    const e = getAllEmpresas().find(e => e.id === id);
    if (!e) return;
    document.getElementById('modal-empresa-title').textContent = 'Editar Empresa';
    document.getElementById('emp-id').value       = e.id;
    document.getElementById('emp-razao').value    = e.razao;
    document.getElementById('emp-fantasia').value = e.fantasia || '';
    document.getElementById('emp-cnpj').value     = e.cnpj;
    document.getElementById('emp-resp').value     = e.resp;
    document.getElementById('emp-tel').value      = e.tel || '';
    document.getElementById('emp-email').value    = e.email || '';
    document.getElementById('emp-contrato-inicio').value = e.contratoInicio || '';
    document.getElementById('emp-contrato-fim').value    = e.contratoFim || '';
    document.getElementById('emp-doc-dp').value          = e.docDPValidade || '';
    document.getElementById('emp-doc-sesmt').value       = e.docSESMTValidade || '';
    renderChecklistTreinamentosEmpresa(e.treinamentosObrigatorios || []);
    document.getElementById('modal-empresa').classList.add('open');
  }

  function fecharModalEmpresa() {
    document.getElementById('modal-empresa').classList.remove('open');
  }

  document.getElementById('modal-empresa').addEventListener('click', function(e) {
    if (e.target === this) fecharModalEmpresa();
  });

  function salvarEmpresa() {
    const id       = document.getElementById('emp-id').value;
    const razao    = document.getElementById('emp-razao').value.trim();
    const fantasia = document.getElementById('emp-fantasia').value.trim();
    const cnpj     = document.getElementById('emp-cnpj').value.trim();
    const resp     = document.getElementById('emp-resp').value.trim();
    const tel      = document.getElementById('emp-tel').value.trim();
    const email    = document.getElementById('emp-email').value.trim();
    const contratoInicio = document.getElementById('emp-contrato-inicio').value;
    const contratoFim    = document.getElementById('emp-contrato-fim').value;
    const docDPValidade  = document.getElementById('emp-doc-dp').value;
    const docSESMTValidade = document.getElementById('emp-doc-sesmt').value;
    const treinamentosObrigatorios = getTreinamentosSelecionadosEmpresa();

    if (!razao || !cnpj || !resp) {
      toast('⚠ Preencha Razão Social, CNPJ e Responsável.');
      return;
    }

    let lista = getAllEmpresas();

    if (id) {
      lista = lista.map(e => e.id === id ? { ...e, razao, fantasia, cnpj, resp, tel, email, contratoInicio, contratoFim, docDPValidade, docSESMTValidade, treinamentosObrigatorios } : e);
      const terceiros = getAll().map(t => t.empresaId === id ? { ...t, empresa: fantasia ? `${razao} (${fantasia})` : razao } : t);
      saveAll(terceiros);
      toast('✓ Empresa atualizada!');
    } else {
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      if (lista.find(e => e.cnpj.replace(/\D/g, '') === cnpjLimpo)) {
        toast('⚠ Já existe uma empresa com este CNPJ.');
        return;
      }
      lista.push({ id: uid(), razao, fantasia, cnpj, resp, tel, email, contratoInicio, contratoFim, docDPValidade, docSESMTValidade, treinamentosObrigatorios });
      toast('✓ Empresa cadastrada!');
    }

    saveAllEmpresas(lista);
    fecharModalEmpresa();
    renderEmpresas();
    popularSelectEmpresas('f-empresa');
    popularSelectEmpresas('e-empresa');
    atualizarStats();
  }

  function renderListaMotivos(titulo, status) {
    const itens = status.motivos.length ? status.motivos : (status.avisos.length ? status.avisos : ['Sem pendências']);
    const classe = status.ok ? 'ok' : 'blocked';
    return `<div class="analysis-card">
      <strong>${titulo} ${status.ok ? '<span class="badge badge-ok">LIBERADO</span>' : '<span class="badge badge-blocked">NEGADO</span>'}</strong>
      <ul class="analysis-list">${itens.map(i => `<li>${i}</li>`).join('')}</ul>
    </div>`;
  }

  function abrirAnalise(id) {
    const t = getAll().find(x => x.id === id);
    if (!t) return;
    const empresa = getEmpresaById(t.empresaId);
    const st = getStatus(t);
    const obrig = getTreinosObrigatoriosDaEmpresa(t.empresaId);
    const treinosHtml = obrig.length ? obrig.map(tr => {
      const ts = getStatusTreinamentoTerceiro(t, tr);
      const reg = getTreinoRealizado(t, tr.id);
      return `<li>${reg?.data ? '•' : '—'} ${tr.nome} — ${reg?.data ? 'Realizado em ' + fmtData(reg.data) + ' | vence em ' + fmtData(ts.vencimento) : 'Sem data cadastrada'}</li>`;
    }).join('') : '<li>Empresa sem treinamentos adicionais vinculados.</li>';

    document.getElementById('analise-conteudo').innerHTML = `
      <div class="result-status">
        <div class="status-icon ${st.ok ? 'ok' : 'blocked'}"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${st.ok ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'}</svg></div>
        <div><div class="status-label ${st.ok ? 'ok' : 'blocked'}">${st.ok ? 'ACESSO LIBERADO' : 'ACESSO NEGADO'}</div><div class="status-sub">${escapeHtmlSafeV131(t.nome)} • ${escapeHtmlSafeV131(t.empresa || 'Sem empresa')}</div></div>
      </div>
      <div class="result-info">
        <div class="info-item"><label>CPF</label><span>${escapeHtmlSafeV131(t.cpf)}</span></div>
        <div class="info-item"><label>Função</label><span>${escapeHtmlSafeV131(t.funcao || '—')}</span></div>
        <div class="info-item"><label>Contrato Empresa</label><span>${empresa?.contratoFim ? fmtData(empresa.contratoFim) + ' ' + tagData(empresa.contratoFim) : 'Não informado'}</span></div>
        <div class="info-item"><label>ASO</label><span>${fmtData(t.aso)} ${tagData(t.aso)}</span></div>
      </div>
      <div class="analysis-grid" style="margin-top:16px;">
        ${renderListaMotivos('DP', st.dp)}
        ${renderListaMotivos('SESMT', st.sesmt)}
      </div>
      <div class="analysis-card" style="margin-top:14px;">
        <strong>Treinamentos adicionais</strong>
        <ul class="analysis-list">${treinosHtml}</ul>
      </div>
    `;
    document.getElementById('modal-analise').classList.add('open');
  }


  // Alias para botões da Portaria Express e cards novos abrirem a ficha/análise completa
  function abrirAnaliseTerceiro(id) {
    return abrirAnalise(id);
  }

  function fecharModalAnalise() {
    document.getElementById('modal-analise').classList.remove('open');
  }

  document.getElementById('modal-analise').addEventListener('click', function(e) {
    if (e.target === this) fecharModalAnalise();
  });


  // ──────────────────────────────────────────────────
  //  V10 — Gestão completa: clique nos cards, filtros, histórico, anexos e e-mail
  // ──────────────────────────────────────────────────
  function registrarHistorico(entidade, id, descricao) {
    const log = JSON.parse(localStorage.getItem('historico') || '[]');
    log.unshift({ id: uid(), entidade, entidadeId: id, data: new Date().toISOString(), descricao });
    localStorage.setItem('historico', JSON.stringify(log.slice(0, 1000)));
  }

  function getHistorico(entidade, id) {
    return JSON.parse(localStorage.getItem('historico') || '[]').filter(h => h.entidade === entidade && h.entidadeId === id);
  }

  function getAnexosTerceiro(id) {
    return JSON.parse(localStorage.getItem('anexosTerceiros') || '{}')[id] || [];
  }

  function saveAnexosTerceiro(id, anexos) {
    const all = JSON.parse(localStorage.getItem('anexosTerceiros') || '{}');
    all[id] = anexos;
    localStorage.setItem('anexosTerceiros', JSON.stringify(all));
  }

  function adicionarAnexoTerceiro(id) {
    const tipo = document.getElementById('anexo-tipo')?.value || 'Documento';
    const nome = document.getElementById('anexo-nome')?.value.trim();
    if (!nome) { toast('Informe o nome do documento/anexo.'); return; }
    const anexos = getAnexosTerceiro(id);
    anexos.unshift({ id: uid(), tipo, nome, data: new Date().toISOString() });
    saveAnexosTerceiro(id, anexos);
    registrarHistorico('terceiro', id, `Anexo registrado: ${tipo} - ${nome}`);
    abrirAnalise(id);
    toast('Anexo registrado.');
  }

  function removerAnexoTerceiro(id, anexoId) {
    saveAnexosTerceiro(id, getAnexosTerceiro(id).filter(a => a.id !== anexoId));
    registrarHistorico('terceiro', id, 'Anexo removido.');
    abrirAnalise(id);
  }

  function preencherFiltroEmpresas() {
    const sel = document.getElementById('filtro-empresa-lista');
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '<option value="">Todas as empresas</option>';
    getAllEmpresas().forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.fantasia ? `${e.razao} (${e.fantasia})` : e.razao;
      sel.appendChild(opt);
    });
    sel.value = atual;
  }

  const _showPageBase = showPage;
  showPage = function(name) {
    _showPageBase(name);
    if (name === 'listagem') preencherFiltroEmpresas();
  };

  const _salvarTerceiroBase = salvarTerceiro;
  salvarTerceiro = function() {
    const antes = getAll().length;
    _salvarTerceiroBase();
    const depois = getAll();
    if (depois.length > antes) {
      registrarHistorico('terceiro', depois[depois.length - 1].id, 'Cadastro inicial do terceiro criado.');
    }
  };

  const _salvarEdicaoBase = salvarEdicao;
  salvarEdicao = function() {
    const id = document.getElementById('e-id')?.value;
    const antigo = getAll().find(t => t.id === id);
    _salvarEdicaoBase();
    const novo = getAll().find(t => t.id === id);
    if (antigo && novo) {
      const diffs = [];
      ['nome','cpf','empresa','funcao','aso','integ'].forEach(c => { if ((antigo[c] || '') !== (novo[c] || '')) diffs.push(`${c}: ${antigo[c] || '—'} → ${novo[c] || '—'}`); });
      registrarHistorico('terceiro', id, diffs.length ? 'Alteração: ' + diffs.join(' | ') : 'Cadastro revisado sem alteração principal.');
    }
  };

  const _salvarEmpresaBase = salvarEmpresa;
  salvarEmpresa = function() {
    const idAntes = document.getElementById('emp-id')?.value;
    _salvarEmpresaBase();
    if (idAntes) registrarHistorico('empresa', idAntes, 'Empresa alterada.');
  };

  function contarTreinamentosRegistrados(terceiros) {
    return terceiros.reduce((total, t) => total + (t.treinamentosRealizados || []).filter(reg =>
      isDataValidaSistema(reg.data) && getTreinamentoById(reg.treinamentoId)).length, 0);
  }
  function escapeTrainingText(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function badgeTreinamentosComplementares(t) {
    const total = contarTreinamentosRegistrados([t]);
    return '<span class="badge">' + (total ? total + ' treinamento(s) registrado(s)' : 'Sem treinamentos adicionais') + '</span>';
  }

  function getResumoExecutivo() {
    const terceiros = getAll();
    const empresas = getAllEmpresas();
    const hojeIso = hoje();
    const asoVencidos = terceiros.filter(t => isDataValidaSistema(t.aso) && t.aso < hojeIso).length;
    const integVencidas = terceiros.filter(t => isDataValidaSistema(t.integ) && t.integ < hojeIso).length;
    const treinosPendentes = contarTreinamentosRegistrados(terceiros);
    const contratosVencidos = empresas.filter(e => isDataValidaSistema(e.contratoFim) && e.contratoFim < hojeIso).length;
    return { asoVencidos, integVencidas, treinosPendentes, contratosVencidos };
  }

  function renderListaAcoes() {
    const wrap = document.getElementById('dash-lista-acoes');
    if (!wrap) return;
    const r = getResumoExecutivo();
    const itens = [
      { titulo:'ASOs vencidos', qtd:r.asoVencidos, desc:'Terceiros com ASO fora da validade.', acao:"showPage('pendencias')" },
      { titulo:'Integrações vencidas', qtd:r.integVencidas, desc:'Terceiros com integração fora da validade.', acao:"showPage('pendencias')" },
      { titulo:'Contratos de empresa vencidos', qtd:r.contratosVencidos, desc:'Empresas com fim de prestação vencido.', acao:"showPage('empresas')" }
    ].filter(i => i.qtd > 0);
    wrap.innerHTML = itens.length ? itens.map(i => `<div class="quick-action" onclick="${i.acao}"><div><strong>${i.titulo}</strong><small>${i.desc}</small></div><span class="badge badge-blocked">${i.qtd}</span></div>`).join('') : '<p style="font-size:14px;color:var(--muted);">Nenhuma ação urgente no momento.</p>';
  }

  const _atualizarStatsBase = atualizarStats;
  atualizarStats = function() {
    _atualizarStatsBase();
    const r = getResumoExecutivo();
    const set = (id,val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('exec-aso-vencidos', r.asoVencidos);
    set('exec-integ-vencidas', r.integVencidas);
    set('exec-treinos-pendentes', r.treinosPendentes);
    set('exec-contratos-vencidos', r.contratosVencidos);
    renderListaAcoes();
  };

  const _renderListaBase = renderLista;
  renderLista = function() {
    preencherFiltroEmpresas();
    const filtro = document.getElementById('filtro-empresa-lista')?.value || '';
    _renderListaBase();
    if (!filtro) return;
    const tbody = document.getElementById('tabela-body');
    if (!tbody) return;
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const nome = tr.querySelector('.td-name')?.textContent || '';
      const cpf = tr.querySelector('.td-cpf')?.textContent || '';
      const t = getAll().find(x => x.nome === nome && x.cpf === cpf);
      if (t && t.empresaId !== filtro) tr.remove();
    });
    const empty = document.getElementById('lista-empty');
    if (empty && tbody.children.length === 0) empty.style.display = 'block';
  };

  const _montarPendenciasBase = montarPendencias;
  montarPendencias = function() {
    const dados = _montarPendenciasBase();
    ['vencidas','proximas','semData'].forEach(k => dados[k].forEach(p => {
      if (!p.terceiroId) {
        const t = getAll().find(x => (x.nome || '') === (p.terceiro || '') && (x.cpf || '') === (p.cpf || ''));
        if (t) p.terceiroId = t.id;
      }
    }));
    return dados;
  };

  const _renderPendenciaItemBase = renderPendenciaItem;
  renderPendenciaItem = function(p, classe) {
    const html = _renderPendenciaItemBase(p, classe);
    return html.replace('<div class="pendency-item">', `<div class="pendency-item" onclick="${p.terceiroId ? `abrirAnalise('${p.terceiroId}')` : ''}">`);
  };

  const _renderDashboardBase = renderDashboard;
  renderDashboard = function() {
    _renderDashboardBase();
    const wrap = document.getElementById('dash-lista-bloqueados');
    if (!wrap) return;
    const items = wrap.querySelectorAll('.dash-item');
    const bloqueados = getAll().map(t => ({...t, status:getStatus(t)})).filter(t => !t.status.ok);
    items.forEach((el, idx) => { if (bloqueados[idx]) el.setAttribute('onclick', `abrirAnalise('${bloqueados[idx].id}')`); });
  };

  function copiarTexto(texto) {
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(() => toast('Texto copiado.'));
    else { prompt('Copie o texto:', texto); }
  }

  function gerarTextoEmailTerceiro(id) {
    const t = getAll().find(x => x.id === id);
    if (!t) return '';
    const st = getStatus(t);
    return `Bom dia,\n\nSegue pendência de acesso de terceiro:\n\nTerceiro: ${t.nome}\nEmpresa: ${t.empresa || 'Não informada'}\nCPF: ${t.cpf || 'Não informado'}\nStatus: ${st.ok ? 'LIBERADO' : 'BLOQUEADO'}\n\nMotivos/Pendências:\n- ${st.motivos.length ? st.motivos.join('\n- ') : 'Sem pendências'}\n\nGentileza regularizar para atualização do controle de acesso.\n\nAtt.`;
  }

  const _abrirAnaliseBase = abrirAnalise;
  abrirAnalise = function(id) {
    _abrirAnaliseBase(id);
    const t = getAll().find(x => x.id === id);
    const box = document.getElementById('analise-conteudo');
    if (!t || !box) return;
    const historico = getHistorico('terceiro', id);
    const anexos = getAnexosTerceiro(id);
    const extra = `
      <div class="analysis-section">
        <strong>Atalhos</strong>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button class="btn btn-primary" onclick="copiarTexto(gerarTextoEmailTerceiro('${id}'))">Copiar e-mail de pendência</button>
          <button class="btn btn-ghost" onclick="abrirEdicao('${id}')">Editar cadastro</button>
        </div>
      </div>
      <div class="analysis-section">
        <strong>Anexos / documentos registrados</strong>
        <div class="attachment-form">
          <select id="anexo-tipo"><option>ASO</option><option>Integração</option><option>Treinamento</option><option>Ficha EPI</option><option>Contrato/Ficha Registro</option><option>CNH</option><option>Outro</option></select>
          <input id="anexo-nome" placeholder="Ex.: ASO_Pablo_2026.pdf">
          <button class="btn btn-primary" onclick="adicionarAnexoTerceiro('${id}')">Adicionar</button>
        </div>
        <div class="attachment-list">${anexos.length ? anexos.map(a => `<div class="attachment-item"><strong>${a.tipo}</strong> — ${a.nome}<br><small>${new Date(a.data).toLocaleString('pt-BR')}</small> <button class="btn btn-danger" style="padding:4px 8px;font-size:11px;margin-left:6px;" onclick="removerAnexoTerceiro('${id}','${a.id}')">Remover</button></div>`).join('') : '<p style="font-size:13px;color:var(--muted);margin-top:8px;">Nenhum anexo registrado ainda.</p>'}</div>
      </div>
      <div class="analysis-section">
        <strong>Histórico de alterações</strong>
        <div class="history-list">${historico.length ? historico.slice(0,10).map(h => `<div class="history-item"><strong>${new Date(h.data).toLocaleString('pt-BR')}</strong><br>${escapeHtmlSafeV131(h.descricao)}</div>`).join('') : '<p style="font-size:13px;color:var(--muted);margin-top:8px;">Sem histórico registrado para este terceiro.</p>'}</div>
      </div>`;
    box.insertAdjacentHTML('beforeend', extra);
  };


  // ──────────────────────────────────────────────────
  //  V11 — Inteligência, ranking e relatório executivo
  // ──────────────────────────────────────────────────
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

  function renderEmpresas() {
    atualizarStats();
    const q = (document.getElementById('busca-empresas')?.value || '').toLowerCase().trim();
    let lista = getAllEmpresas();
    if (q) lista = lista.filter(e => correspondeBuscaSST(q, [e.razao, e.fantasia], [e.cnpj]));

    const tbody = document.getElementById('tabela-empresas');
    const empty = document.getElementById('empresas-empty');
    tbody.innerHTML = '';

    if (!lista.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    lista.forEach(e => {
      const contratoSt = statusData(e.contratoFim);
      const dpSt = statusData(e.docDPValidade);
      const sesmtSt = statusData(e.docSESMTValidade);
      const contratoBadge = e.contratoFim ? badgeStatus(contratoSt.label, contratoSt.classe) + '<br><small>' + fmtData(e.contratoFim) + '</small>' : '<span class="badge badge-warn">Sem data</span>';
      const dpBadge = e.docDPValidade ? badgeStatus(dpSt.label, dpSt.classe) : '<span class="badge badge-warn">Sem data</span>';
      const sesmtBadge = e.docSESMTValidade ? badgeStatus(sesmtSt.label, sesmtSt.classe) : '<span class="badge badge-warn">Sem data</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-name">${e.razao}</td>
        <td class="td-company">${e.fantasia || '—'}</td>
        <td class="td-cpf">${e.cnpj}</td>
        <td>${e.resp}</td>
        <td>${e.tel || '—'}</td>
        <td>${contratoBadge}</td>
        <td>${dpBadge}</td>
        <td>${sesmtBadge}</td>
        <td><span class="badge badge-warn">${(e.treinamentosObrigatorios || []).length} vinculado(s)</span></td>
        <td>
          <div class="actions">
            <button class="btn btn-ghost" style="padding:5px 12px;font-size:12px;" onclick="abrirModalEditarEmpresa('${e.id}')">Editar</button>
            <button class="btn btn-danger" style="padding:5px 12px;font-size:12px;" onclick="excluirEmpresa('${e.id}')">Excluir</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  function excluirEmpresa(id) {
    const vinculados = getAll().filter(t => t.empresaId === id).length;
    if (vinculados > 0) {
      toast(`⚠ Esta empresa possui ${vinculados} terceiro(s) vinculado(s). Remova-os primeiro.`);
      return;
    }
    if (!confirm('Deseja excluir esta empresa?')) return;
    saveAllEmpresas(getAllEmpresas().filter(e => e.id !== id));
    renderEmpresas();
    inicializarTreinamentosPadrao();
  popularSelectEmpresas('f-empresa');
  renderTreinosExigidosCadastro();
    popularSelectEmpresas('e-empresa');
    toast('Empresa removida.');
  }


  inicializarTreinamentosPadrao();
  popularSelectEmpresas('f-empresa');
  renderTreinosExigidosCadastro();
  renderDashboard();

  // ──────────────────────────────────────────────────
  //  PORTARIA
  // ──────────────────────────────────────────────────
  function limparResultadoPortaria() {
    const result = document.getElementById('portaria-result');
    const notFound = document.getElementById('portaria-not-found');
    const matches = document.getElementById('portaria-matches');
    if (result) result.classList.remove('show');
    if (notFound) notFound.classList.remove('show');
    if (matches) matches.style.display = 'none';
  }

  function normalizarBusca(txt) {
    return (txt || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function buscarTerceirosPortaria(q) {
    const lista = getAll();
    const termo = normalizarBusca(q);
    const termoNumerico = (q || '').replace(/\D/g, '');
    if (!termo && !termoNumerico) return [];

    // 1) CPF exato: se digitou 11 números, só aceita CPF igual.
    if (termoNumerico.length === 11) {
      return lista.filter(t => (t.cpf || '').replace(/\D/g, '') === termoNumerico);
    }

    // 2) CPF parcial com pelo menos 4 números.
    if (termoNumerico.length >= 4) {
      const porCpf = lista.filter(t => (t.cpf || '').replace(/\D/g, '').includes(termoNumerico));
      if (porCpf.length) return porCpf;
    }

    // 3) Nome exato, ignorando acentos e maiúsculas.
    const exatos = lista.filter(t => normalizarBusca(t.nome) === termo);
    if (exatos.length) return exatos;

    // 4) Nome por palavras: todas as palavras digitadas precisam existir no nome.
    const partes = termo.split(/\s+/).filter(Boolean);
    if (!partes.length) return [];
    return lista.filter(t => {
      const nome = normalizarBusca(t.nome);
      return partes.every(p => nome.includes(p));
    });
  }

  function renderListaEscolhaPortaria(resultados) {
    const matches = document.getElementById('portaria-matches');
    const list = document.getElementById('portaria-matches-list');
    if (!matches || !list) return;

    list.innerHTML = resultados.map(t => {
      const st = getStatus(t);
      const badge = st.ok ? '<span class="match-badge ok">LIBERADO</span>' : '<span class="match-badge blocked">BLOQUEADO</span>';
      return `
        <button class="match-item" onclick="consultarPortariaPorId('${t.id}')">
          <span>
            <strong>${t.nome || 'Sem nome'}</strong>
            <small>${escapeHtmlSafeV131(t.empresa || 'Sem empresa')} • ${t.funcao || 'Sem função'} • ${t.cpf || 'Sem CPF'}</small>
          </span>
          ${badge}
        </button>`;
    }).join('');

    matches.style.display = 'block';
  }

  function consultarPortaria() {
    const q = document.getElementById('busca-portaria').value.trim();
    limparResultadoPortaria();
    if (!q) return;

    const resultados = buscarTerceirosPortaria(q);
    const notFound = document.getElementById('portaria-not-found');

    if (!resultados.length) {
      if (notFound) notFound.classList.add('show');
      return;
    }

    if (resultados.length === 1) {
      preencherResultadoPortaria(resultados[0]);
      return;
    }

    renderListaEscolhaPortaria(resultados.slice(0, 30));
    toast(`Encontramos ${resultados.length} cadastros. Selecione o correto.`);
  }

  function consultarPortariaPorId(id) {
    const found = getAll().find(t => t.id === id);
    limparResultadoPortaria();
    if (!found) {
      const notFound = document.getElementById('portaria-not-found');
      if (notFound) notFound.classList.add('show');
      return;
    }
    preencherResultadoPortaria(found);
  }

  function preencherResultadoPortaria(found) {
    const result = document.getElementById('portaria-result');
    const statusCompleto = getStatus(found);
    const { ok, motivos } = statusCompleto;

    const icon = document.getElementById('r-icon');
    const svg  = document.getElementById('r-icon-svg');
    icon.className = 'status-icon ' + (ok ? 'ok' : 'blocked');
    svg.innerHTML = ok
      ? '<polyline points="20 6 9 17 4 12"/>'
      : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';

    const label = document.getElementById('r-status-label');
    label.textContent = ok ? 'LIBERADO' : 'BLOQUEADO';
    label.className = 'status-label ' + (ok ? 'ok' : 'blocked');
    document.getElementById('r-status-sub').textContent = ok ? 'Documentação em dia — acesso permitido' : 'Acesso não autorizado';

    document.getElementById('r-nome').textContent    = found.nome || '—';
    document.getElementById('r-empresa').textContent = found.empresa || '—';
    document.getElementById('r-funcao').textContent  = found.funcao || '—';
    document.getElementById('r-cpf').textContent     = found.cpf || '—';
    document.getElementById('r-aso').innerHTML       = fmtData(found.aso) + tagData(found.aso);
    document.getElementById('r-integ').innerHTML     = fmtData(found.integ) + tagData(found.integ);

    const setorWrap = document.getElementById('r-status-setores');
    const dpPanel = document.getElementById('r-dp-panel');
    const sesmtPanel = document.getElementById('r-sesmt-panel');
    const dp = statusCompleto.dp;
    const sesmt = statusCompleto.sesmt;
    if (setorWrap) setorWrap.style.display = 'grid';
    if (dpPanel) dpPanel.className = 'status-panel ' + (dp.ok ? 'ok' : 'blocked');
    if (sesmtPanel) sesmtPanel.className = 'status-panel ' + (sesmt.ok ? 'ok' : 'blocked');
    document.getElementById('r-dp-status').innerHTML = dp.ok ? '<span class="badge badge-ok">ACESSO LIBERADO</span>' : '<span class="badge badge-blocked">ACESSO NEGADO</span>';
    document.getElementById('r-sesmt-status').innerHTML = sesmt.ok ? '<span class="badge badge-ok">ACESSO LIBERADO</span>' : '<span class="badge badge-blocked">ACESSO NEGADO</span>';
    document.getElementById('r-dp-motivos').innerHTML = (dp.motivos.length ? dp.motivos : (dp.avisos.length ? dp.avisos : ['Sem pendências do DP'])).map(m => `<li>${m}</li>`).join('');
    document.getElementById('r-sesmt-motivos').innerHTML = (sesmt.motivos.length ? sesmt.motivos : (sesmt.avisos.length ? sesmt.avisos : ['Sem pendências SESMT'])).map(m => `<li>${m}</li>`).join('');

    const rTreinosWrap = document.getElementById('r-treinos-wrap');
    const rTreinosList = document.getElementById('r-treinos-list');
    const obrigatorios = getTreinosObrigatoriosDaEmpresa(found.empresaId);
    if (obrigatorios.length) {
      rTreinosList.innerHTML = obrigatorios.map(tr => {
        const st = getStatusTreinamentoTerceiro(found, tr);
        const cls = 'status-mini';
        const reg = getTreinoRealizado(found, tr.id);
        const detalhe = reg?.data && isDataValidaSistema(reg.data) ? `Realizado: ${fmtData(reg.data)}` : 'Sem data cadastrada';
        return `<span class="training-tag">${tr.nome} <span class="${cls}">${reg?.data ? 'Registrado' : 'Opcional'}</span><small style="display:block;color:var(--muted);margin-top:3px;">${detalhe}</small></span>`;
      }).join('');
      rTreinosWrap.style.display = 'block';
    } else {
      rTreinosWrap.style.display = 'none';
      rTreinosList.innerHTML = '';
    }

    const motivosWrap = document.getElementById('r-motivos');
    const motivosList = document.getElementById('r-motivos-list');
    if (motivos.length) {
      motivosList.innerHTML = motivos.map(m => `<li>${m}</li>`).join('');
      motivosWrap.style.display = 'block';
    } else {
      motivosWrap.style.display = 'none';
    }

    const obsWrap = document.getElementById('r-obs-wrap');
    if (found.obs) {
      document.getElementById('r-obs').textContent = found.obs;
      obsWrap.style.display = 'block';
    } else {
      obsWrap.style.display = 'none';
    }

    result.classList.add('show');
  }

  // ──────────────────────────────────────────────────
  //  DADOS, BACKUP E IMPORTAÇÃO
  // ──────────────────────────────────────────────────
  function renderDados() {
    const terceiros = getAll();
    const empresas = getAllEmpresas();
    const treinamentos = getAllTreinamentos();
    const pendencias = typeof coletarPendencias === 'function' ? coletarPendencias() : [];
    const elT = document.getElementById('dados-total-terceiros');
    const elE = document.getElementById('dados-total-empresas');
    const elTr = document.getElementById('dados-total-treinamentos');
    const elP = document.getElementById('dados-total-pendencias');
    if (elT) elT.textContent = terceiros.length;
    if (elE) elE.textContent = empresas.length;
    if (elTr) elTr.textContent = treinamentos.length;
    if (elP) elP.textContent = pendencias.length;
  }

  function baixarArquivo(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportarBackupJSON() {
    const backup = {
      app: 'Controle de Terceiros',
      versao: 'V8',
      exportadoEm: new Date().toISOString(),
      terceiros: getAll(),
      empresas: getAllEmpresas(),
      treinamentos: getAllTreinamentos()
    };
    baixarArquivo('backup-controle-terceiros.json', JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
    toast('✓ Backup gerado.');
  }

  function importarBackupJSON(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.terceiros) || !Array.isArray(data.empresas) || !Array.isArray(data.treinamentos)) {
          throw new Error('Arquivo inválido para este sistema.');
        }
        if (!confirm('Esse backup vai substituir os cadastros atuais. Deseja continuar?')) return;
        saveAll(data.terceiros);
        saveAllEmpresas(data.empresas);
        saveAllTreinamentos(data.treinamentos);
        popularSelectEmpresas('f-empresa');
        popularSelectEmpresas('e-empresa');
        renderDashboard();
        renderDados();
        document.getElementById('import-log').textContent = `Backup restaurado com sucesso.\nTerceiros: ${data.terceiros.length}\nEmpresas: ${data.empresas.length}\nTreinamentos: ${data.treinamentos.length}`;
        toast('✓ Backup restaurado.');
      } catch (err) {
        toast('⚠ Erro ao importar backup.');
        document.getElementById('import-log').textContent = 'Erro ao importar backup: ' + err.message;
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  function csvEscape(v) {
    const s = (v ?? '').toString().replace(/"/g, '""');
    return `"${s}"`;
  }

  function exportarCSVTerceiros() {
    const header = ['Nome','CPF','Empresa','Função','ASO','Integração','Status','Motivos','Observação'];
    const rows = getAll().map(t => {
      const st = getStatus(t);
      return [t.nome, t.cpf, t.empresa, t.funcao, fmtData(t.aso), fmtData(t.integ), st.ok ? 'LIBERADO' : 'BLOQUEADO', st.motivos.join(' | '), t.obs || ''];
    });
    const csv = [header, ...rows].map(r => r.map(csvEscape).join(';')).join('\n');
    baixarArquivo('terceiros-controle.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  }

  function exportarCSVEmpresas() {
    const header = ['Razão Social','Fantasia','CNPJ','Responsável','Telefone','E-mail','Contrato Início','Contrato Fim','Treinamentos Obrigatórios'];
    const rows = getAllEmpresas().map(e => {
      const nomes = (e.treinamentosObrigatorios || []).map(id => getTreinamentoById(id)?.nome).filter(Boolean).join(' | ');
      return [e.razao, e.fantasia || '', e.cnpj, e.resp, e.tel || '', e.email || '', fmtData(e.contratoInicio), fmtData(e.contratoFim), nomes];
    });
    const csv = [header, ...rows].map(r => r.map(csvEscape).join(';')).join('\n');
    baixarArquivo('empresas-controle.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  }

  function baixarModeloCSV() {
    const csv = [
      ['Empresa','CNPJ','Nome do Profissional','CPF','Função','ASO','Integração','Fim Prestação Serviço'],
      ['Landim','00.000.000/0001-00','Jonilson Guimarães','000.000.000-00','Soldador','31/12/2026','31/12/2026','31/12/2026']
    ].map(r => r.map(csvEscape).join(';')).join('\n');
    baixarArquivo('modelo-importacao-controle-terceiros.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  }

  function normalizarTexto(v) {
    return (v ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function localizarColuna(headers, termos) {
    const norm = headers.map(h => normalizarTexto(h));
    return norm.findIndex(h => termos.some(t => h.includes(normalizarTexto(t))));
  }

  function localizarLinhaCabecalho(rows) {
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const txt = rows[i].map(normalizarTexto).join(' | ');
      if ((txt.includes('empresa') || txt.includes('cnpj')) && (txt.includes('profissional') || txt.includes('nome'))) return i;
    }
    return 0;
  }

  function valorCelula(row, idx) {
    if (idx < 0) return '';
    return row[idx] ?? '';
  }

  function extrairCNPJ(texto) {
    const s = (texto || '').toString();
    const m = s.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    return m ? maskCNPJ(m[0]) : '';
  }

  function limparNomeEmpresa(texto) {
    return (texto || '').toString().replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, '').replace(/[-–—]+$/g,'').trim();
  }

  function dataParaISO(v) {
    if (!v && v !== 0) return '';
    if (typeof v === 'number') {
      // Excel serial date
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(epoch.getTime() + v * 86400000);
      return d.toISOString().split('T')[0];
    }
    const s = v.toString().trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    const m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = '20' + y;
      return `${y.padStart(4,'0')}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    return '';
  }

  function importarPlanilhaExcel(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') {
      toast('⚠ Biblioteca de Excel não carregou. Verifique a internet.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
        if (!rows.length) throw new Error('Planilha vazia.');

        const headerIdx = localizarLinhaCabecalho(rows);
        const headers = rows[headerIdx];
        const idxEmpresa = localizarColuna(headers, ['nome da empresa', 'empresa']);
        const idxCnpj = localizarColuna(headers, ['cnpj']);
        const idxProf = localizarColuna(headers, ['nome do profissional', 'profissional', 'nome completo', 'colaborador', 'terceiro']);
        const idxCpf = localizarColuna(headers, ['cpf']);
        const idxFuncao = localizarColuna(headers, ['funcao', 'função', 'cargo']);
        const idxAso = localizarColuna(headers, ['aso', 'documentos sesmt']);
        const idxInteg = localizarColuna(headers, ['integracao', 'integração', 'validade treinamento']);
        const idxFim = localizarColuna(headers, ['fim prestacao', 'fim prestação', 'fim contrato', 'prestacao servico']);
        const idxSituacaoAcesso = localizarColuna(headers, ['situação acesso', 'situacao acesso', 'acesso', 'status acesso']);
        const idxSituacaoDP = localizarColuna(headers, ['situação dp', 'situacao dp', 'situação gestão', 'situacao gestao', 'gestão de pessoas', 'gestao de pessoas']);
        const idxSituacaoSESMT = localizarColuna(headers, ['situação sesmt', 'situacao sesmt', 'sesmt']);

        if (idxEmpresa < 0 || idxProf < 0) {
          throw new Error('Não encontrei as colunas mínimas: Empresa e Nome do Profissional.');
        }

        let empresas = getAllEmpresas();
        let terceiros = getAll();
        let novasEmpresas = 0, novosTerceiros = 0, atualizados = 0, ignorados = 0;

        for (let r = headerIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          const empresaTextoOriginal = valorCelula(row, idxEmpresa).toString().trim();
          const profissional = valorCelula(row, idxProf).toString().trim();
          if (!empresaTextoOriginal || !profissional) { ignorados++; continue; }

          const cnpjPlanilha = idxCnpj >= 0 ? valorCelula(row, idxCnpj).toString().trim() : '';
          const cnpj = maskCNPJ((cnpjPlanilha || extrairCNPJ(empresaTextoOriginal)).replace(/\D/g,''));
          const nomeEmpresa = limparNomeEmpresa(empresaTextoOriginal) || empresaTextoOriginal;
          const fimContrato = dataParaISO(valorCelula(row, idxFim));

          let emp = empresas.find(e =>
            (cnpj && e.cnpj && e.cnpj.replace(/\D/g,'') === cnpj.replace(/\D/g,'')) ||
            normalizarTexto(e.razao) === normalizarTexto(nomeEmpresa)
          );
          if (!emp) {
            emp = { id: uid(), razao: nomeEmpresa, fantasia: '', cnpj: cnpj || '', resp: '', tel: '', email: '', contratoInicio: '', contratoFim: fimContrato || '', treinamentosObrigatorios: [] };
            empresas.push(emp);
            novasEmpresas++;
          } else if (fimContrato && !emp.contratoFim) {
            emp.contratoFim = fimContrato;
          }

          const cpf = maskCPF(valorCelula(row, idxCpf).toString());
          const funcao = valorCelula(row, idxFuncao).toString().trim();
          const aso = dataParaISO(valorCelula(row, idxAso));
          const integ = dataParaISO(valorCelula(row, idxInteg));
          const situacaoAcessoImportada = idxSituacaoAcesso >= 0 ? valorCelula(row, idxSituacaoAcesso).toString().trim() : '';
          const situacaoDPImportada = idxSituacaoDP >= 0 ? valorCelula(row, idxSituacaoDP).toString().trim() : '';
          const situacaoSESMTImportada = idxSituacaoSESMT >= 0 ? valorCelula(row, idxSituacaoSESMT).toString().trim() : '';
          const cpfLimpo = cpf.replace(/\D/g,'');

          let terc = terceiros.find(t =>
            (cpfLimpo && t.cpf && t.cpf.replace(/\D/g,'') === cpfLimpo) ||
            (normalizarTexto(t.nome) === normalizarTexto(profissional) && t.empresaId === emp.id)
          );

          if (!terc) {
            terceiros.push({
              id: uid(), nome: profissional, cpf: cpf || '', empresaId: emp.id, empresa: emp.fantasia ? `${emp.razao} (${emp.fantasia})` : emp.razao,
              funcao: funcao || '', aso: aso || '', integ: integ || '', obs: 'Importado de planilha', treinamentosRealizados: [],
              situacaoAcessoImportada, situacaoDPImportada, situacaoSESMTImportada
            });
            novosTerceiros++;
          } else {
            terc.nome = profissional || terc.nome;
            terc.cpf = cpf || terc.cpf;
            terc.empresaId = emp.id;
            terc.empresa = emp.fantasia ? `${emp.razao} (${emp.fantasia})` : emp.razao;
            terc.funcao = funcao || terc.funcao;
            terc.aso = aso || terc.aso;
            terc.integ = integ || terc.integ;
            terc.situacaoAcessoImportada = situacaoAcessoImportada || terc.situacaoAcessoImportada || '';
            terc.situacaoDPImportada = situacaoDPImportada || terc.situacaoDPImportada || '';
            terc.situacaoSESMTImportada = situacaoSESMTImportada || terc.situacaoSESMTImportada || '';
            atualizados++;
          }
        }

        saveAllEmpresas(empresas);
        saveAll(terceiros);
        popularSelectEmpresas('f-empresa');
        popularSelectEmpresas('e-empresa');
        renderDashboard();
        renderDados();

        const msg = `Importação concluída.\nArquivo: ${file.name}\nLinhas lidas: ${Math.max(rows.length - headerIdx - 1, 0)}\nEmpresas novas: ${novasEmpresas}\nTerceiros novos: ${novosTerceiros}\nTerceiros atualizados: ${atualizados}\nLinhas ignoradas: ${ignorados}\n\nA situação de acesso da planilha foi preservada como histórico. A autorização atual é calculada pelo aplicativo. Confira ASO, Integração e Fim Prestação Serviço após importar.`;
        document.getElementById('import-log').textContent = msg;
        toast('✓ Planilha importada.');
      } catch (err) {
        document.getElementById('import-log').textContent = 'Erro na importação: ' + err.message;
        toast('⚠ Erro ao importar planilha.');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }


  // ──────────────────────────────────────────────────
  //  V10.3 — Correção: status pendente x bloqueado + clique robusto nos cards
  // ──────────────────────────────────────────────────
  // Regra: data ausente/informação incompleta vira AVISO/PENDÊNCIA, não bloqueio.
  // Bloqueio vermelho fica apenas para vencido de fato.
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
  (function configurarLiberacaoExcecao(){
    const css = document.createElement('style');
    css.textContent = `
      .badge-exception { background:#FEF3C7; color:#B45309; }
      .badge-imported { background:#DBEAFE; color:#1D4ED8; }
      .status-mini.imported { background:#DBEAFE; color:#1D4ED8; }

      .stat-exception .stat-value { color:#D97706; }
      .stat-pending .stat-value { color:#D97706; }
      .status-icon.exception { background:var(--warn-lt); color:var(--warn); }
      .status-label.exception { color:var(--warn); }
      .exception-box { border:1px solid #FBBF24; background:#FFFBEB; border-radius:14px; padding:16px; margin-top:14px; }
      .exception-box strong { color:#92400E; }
      .exception-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }
      .exception-grid .full { grid-column:1 / -1; }
      .exception-active { background:#FFFBEB; border:1px solid #FBBF24; border-radius:12px; padding:12px; margin-top:10px; color:#78350F; }
      .exception-list { display:flex; flex-direction:column; gap:10px; }
      .exception-item { border:1px solid var(--border); border-radius:12px; padding:12px; display:grid; grid-template-columns:1fr auto; gap:12px; align-items:start; }
      .exception-item small { display:block; color:var(--muted); margin-top:4px; }
      @media (max-width: 640px) { .exception-grid { grid-template-columns:1fr; } .exception-item { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(css);

    const primeiroGrid = document.querySelector('#page-dashboard .stats-grid');
    if (primeiroGrid && !document.getElementById('dash-excecoes')) {
      const card = document.createElement('div');
      card.className = 'stat-card stat-exception stat-click';
      card.setAttribute('onclick', "abrirListaPorStatus('excecoes')");
      card.innerHTML = '<div class="stat-label">Liberados por Exceção</div><div class="stat-value" id="dash-excecoes">0</div><span class="stat-hint">Toque para ver exceções</span>';
      primeiroGrid.appendChild(card);
      const cardPend = document.createElement('div');
      cardPend.className = 'stat-card stat-pending stat-click';
      cardPend.setAttribute('onclick', "abrirListaPorStatus('pendentes')");
      cardPend.innerHTML = '<div class="stat-label">Pendentes</div><div class="stat-value" id="dash-pendentes">0</div><span class="stat-hint">Toque para ver pendentes</span>';
      primeiroGrid.appendChild(cardPend);
    }

    const rankingCard = document.getElementById('dash-ranking-empresas')?.closest('.card');
    if (rankingCard && !document.getElementById('dash-excecoes-list')) {
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = '<div class="card-title">Liberações por Exceção</div><div id="dash-excecoes-list" class="exception-list"></div>';
      rankingCard.insertAdjacentElement('afterend', div);
    }
  })();

  function getAllExcecoes() {
    return window.tssExceptionStore?.getAll() || {};
  }

  function saveAllExcecoes(data) {
    throw new Error('Use o salvamento individual de exceções no banco.');
  }

  function getExcecaoTerceiro(id) {
    const all = getAllExcecoes();
    const ex = all[id];
    return ex && ex.ativo ? ex : null;
  }

  function getStatusBaseSemExcecao(t) {
    const dp = getStatusDP(t);
    const sesmt = getStatusSESMT(t);
    const motivos = [...dp.motivos, ...sesmt.motivos];
    const avisos = [...dp.avisos, ...sesmt.avisos];
    const bloqueado = motivos.length > 0;
    // Avisos de DP ou proximidade do vencimento não geram pendência de acesso.
    const pendente = !bloqueado && sesmt.avisos.some(aviso =>
      aviso === 'Integração sem data informada' ||
      aviso === 'Documentos SESMT sem data informada');
    return { ok: !bloqueado && !pendente, bloqueado, pendente, excecao:false, motivos, avisos, dp, sesmt };
  }

  function statusImportadoLiberado(t) {
    const raw = (t.situacaoAcessoImportada || t.situacaoAcesso || t.statusAcesso || '').toString();
    const norm = normalizarTexto(raw);
    return norm.includes('acesso liberado') || norm === 'liberado' || norm.includes('liberado');
  }

  function statusImportadoNegado(t) {
    const raw = (t.situacaoAcessoImportada || t.situacaoAcesso || t.statusAcesso || '').toString();
    const norm = normalizarTexto(raw);
    return norm.includes('acesso negado') || norm === 'bloqueado' || norm.includes('negado');
  }

  getStatus = function(t) {
    const base = getStatusBaseSemExcecao(t);
    const ex = getExcecaoTerceiro(t.id);

    // A exceção operacional não substitui o ASO válido do prestador de serviço.
    const pendenciasAtuais = [...base.motivos, ...base.avisos];
    const cobrePendencias = Array.isArray(ex?.pendenciasAutorizadas) && pendenciasAtuais.every(p => ex.pendenciasAutorizadas.includes(p));
    if (ex && cobrePendencias && statusData(t.aso).classe !== 'blocked' && !statusData(t.aso).semData && (base.bloqueado || base.pendente)) {
      return {
        ...base,
        ok: true,
        bloqueado: false,
        pendente: false,
        excecao: true,
        excecaoDados: ex,
        statusTexto: 'LIBERADO POR EXCEÇÃO'
      };
    }

    // Situação importada é apenas histórico; nunca determina a autorização atual.
    return { ...base, statusTexto: base.ok && !base.pendente ? 'LIBERADO' : (base.pendente ? 'PENDENTE' : 'BLOQUEADO') };
  };

  function salvarLiberacaoExcecao(id) {
    const t = getAll().find(x => x.id === id);
    if (!t) return;

    const dataLiberacao = document.getElementById('exc-data')?.value || '';
    const aprovador = document.getElementById('exc-aprovador')?.value.trim() || '';
    const cargo = document.getElementById('exc-cargo')?.value || '';
    const motivo = document.getElementById('exc-motivo')?.value || '';
    const obs = document.getElementById('exc-obs')?.value.trim() || '';

    if (!dataLiberacao || !aprovador || !cargo || !motivo) {
      toast('⚠ Preencha data, aprovador, cargo e motivo da exceção.');
      return;
    }

    if (dataLiberacao < hoje()) {
      toast('⚠ A data da liberação por exceção não pode ser retroativa.');
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
      aprovador,
      cargo,
      motivo,
      obs,
      criadoEm: new Date().toISOString()
    };
    saveAllExcecoes(all);
    registrarHistorico('terceiro', id, `Liberação por exceção registrada por ${aprovador} (${cargo}). Motivo: ${motivo}. Data: ${fmtData(dataLiberacao)}.`);
    toast('✓ Liberação por exceção registrada.');
    abrirAnalise(id);
    renderDashboard();
  }

  async function cancelarLiberacaoExcecao(id) {
    const ex = getExcecaoTerceiro(id);
    if (!ex) return;
    if (!confirm('Cancelar a liberação por exceção deste terceiro?')) return;
    const all = { ...getAllExcecoes() };
    all[id] = { ...all[id], ativo:false, canceladoEm:new Date().toISOString() };
    try { await window.tssExceptionStore.save(id, all[id]); }
    catch(e) { toast('⚠ A exceção não foi cancelada no banco.'); return; }
    registrarHistorico('terceiro', id, 'Liberação por exceção cancelada.');
    toast('Liberação por exceção cancelada.');
    abrirAnalise(id);
    renderDashboard();
  }

  function renderExcecaoBox(id) {
    const ex = getExcecaoTerceiro(id);
    if (ex) {
      return `
        <div class="exception-box">
          <strong>🟡 Liberado por Exceção</strong>
          <div class="exception-active">
            <b>Data da liberação:</b> ${fmtData(ex.dataLiberacao)}<br>
            <b>Aprovador:</b> ${ex.aprovador}<br>
            <b>Cargo:</b> ${ex.cargo}<br>
            <b>Motivo:</b> ${ex.motivo}<br>
            ${ex.obs ? `<b>Observação:</b> ${ex.obs}<br>` : ''}
            <small>Registrado em ${new Date(ex.criadoEm).toLocaleString('pt-BR')}</small>
          </div>
          <div style="margin-top:10px;"><button class="btn btn-danger" onclick="cancelarLiberacaoExcecao('${id}')">Cancelar exceção</button></div>
        </div>`;
    }
    return `
      <div class="exception-box">
        <strong>Liberação por Exceção</strong>
        <p style="font-size:13px;color:#92400E;margin-top:6px;">Use somente quando houver autorização formal para entrada mesmo com pendências. A data não pode ser retroativa.</p>
        <div class="exception-grid">
          <div><label>Data da liberação *</label><input id="exc-data" type="date" min="${hoje()}" value="${hoje()}"></div>
          <div><label>Cargo do aprovador *</label><select id="exc-cargo"><option value="">Selecione...</option><option>Gerente da Planta</option><option>Supervisor Industrial</option><option>Coordenador Industrial</option><option>Outro</option></select></div>
          <div class="full"><label>Nome do aprovador *</label><input id="exc-aprovador" placeholder="Ex.: João da Silva"></div>
          <div class="full"><label>Motivo *</label><select id="exc-motivo"><option value="">Selecione...</option><option>ASO pendente</option><option>Integração pendente</option><option>Documento DP pendente</option><option>Emergência operacional</option><option>Outro</option></select></div>
          <div class="full"><label>Observação</label><textarea id="exc-obs" placeholder="Explique a autorização..."></textarea></div>
        </div>
        <div style="margin-top:12px;"><button class="btn btn-primary" onclick="salvarLiberacaoExcecao('${id}')">Liberar por Exceção</button></div>
      </div>`;
  }

  const _abrirAnaliseV13 = abrirAnalise;
  abrirAnalise = function(id) {
    _abrirAnaliseV13(id);
    const box = document.getElementById('analise-conteudo');
    const t = getAll().find(x => x.id === id);
    if (!box || !t) return;

    const st = getStatus(t);
    const label = box.querySelector('.status-label');
    const icon = box.querySelector('.status-icon');
    if (st.excecao && label) {
      label.textContent = 'LIBERADO POR EXCEÇÃO';
      label.className = 'status-label exception';
      if (icon) icon.className = 'status-icon exception';
    }
    box.insertAdjacentHTML('beforeend', renderExcecaoBox(id));
  };

  const _preencherResultadoPortariaV13 = preencherResultadoPortaria;
  preencherResultadoPortaria = function(found) {
    _preencherResultadoPortariaV13(found);
    const st = getStatus(found);
    if (!st.excecao) return;
    const icon = document.getElementById('r-icon');
    const label = document.getElementById('r-status-label');
    const sub = document.getElementById('r-status-sub');
    if (icon) icon.className = 'status-icon exception';
    if (label) { label.textContent = 'LIBERADO POR EXCEÇÃO'; label.className = 'status-label exception'; }
    if (sub) sub.textContent = `Autorizado por ${st.excecaoDados.aprovador} — ${st.excecaoDados.cargo}`;

    const motivosWrap = document.getElementById('r-motivos');
    const motivosList = document.getElementById('r-motivos-list');
    if (motivosWrap && motivosList) {
      motivosWrap.style.display = 'block';
      motivosList.innerHTML = `
        <li><b>Motivo da exceção:</b> ${st.excecaoDados.motivo}</li>
        <li><b>Data da liberação:</b> ${fmtData(st.excecaoDados.dataLiberacao)}</li>
        <li><b>Aprovador:</b> ${st.excecaoDados.aprovador} — ${st.excecaoDados.cargo}</li>
        ${st.excecaoDados.obs ? `<li><b>Obs:</b> ${st.excecaoDados.obs}</li>` : ''}
        ${(st.motivos || []).map(m => `<li>Pendência: ${m}</li>`).join('')}
        ${(st.avisos || []).map(a => `<li>Aviso: ${a}</li>`).join('')}`;
    }
  };

  const _atualizarStatsV13 = atualizarStats;
  atualizarStats = function() {
    const terceiros = getAll();
    const empresas = (typeof getAllEmpresas === 'function') ? getAllEmpresas() : [];
    const treinamentos = (typeof getAllTreinamentos === 'function') ? getAllTreinamentos() : [];
    const statuses = terceiros.map(t => getStatus(t));
    const liberados = statuses.filter(s => s.ok && !s.excecao && !s.pendente).length;
    const excecoes = statuses.filter(s => s.excecao).length;
    const pendentes = statuses.filter(s => s.pendente && !s.excecao).length;
    const bloqueados = statuses.filter(s => s.bloqueado && !s.excecao).length;
    const pendenciasTreino = contarTreinamentosRegistrados(terceiros);
    const empresasComExigencias = empresas.filter(e => (e.treinamentosObrigatorios || []).length > 0).length;
    const pendenciasGerais = montarPendencias().total;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-total', terceiros.length); set('stat-liberados', liberados); set('stat-bloqueados', bloqueados); set('stat-empresas', empresas.length); set('stat-pendencias-treino', pendenciasTreino);
    set('dash-total', terceiros.length); set('dash-liberados', liberados); set('dash-bloqueados', bloqueados); set('dash-empresas', empresas.length);
    set('dash-excecoes', excecoes); set('dash-pendentes', pendentes);
    set('dash-pendencias', pendenciasGerais); set('dash-treinamentos', treinamentos.length); set('dash-empresas-exigencias', empresasComExigencias);
    set('dash-status-geral', bloqueados === 0 ? (pendentes || excecoes ? 'ATENÇÃO' : 'OK') : 'ATENÇÃO');
  };

  function renderExcecoesDashboard() {
    const wrap = document.getElementById('dash-excecoes-list');
    if (!wrap) return;
    const all = getAllExcecoes();
    const itens = Object.values(all).filter(x => {
      const terceiro = x && getAll().find(t => t.id === x.terceiroId);
      return terceiro && getExcecaoTerceiro(x.terceiroId) && getStatus(terceiro).excecao;
    }).sort((a,b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
    if (!itens.length) {
      wrap.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhuma liberação por exceção ativa.</p>';
      return;
    }
    wrap.innerHTML = itens.slice(0, 20).map(ex => `
      <div class="exception-item" role="button" tabindex="0" data-terceiro-id="${ex.terceiroId}" style="cursor:pointer;">
        <div><strong>${ex.terceiro || 'Terceiro'}</strong><small>${ex.empresa || 'Empresa não informada'} • ${ex.cpf || 'CPF não informado'}</small><small>${ex.motivo} — ${fmtData(ex.dataLiberacao)}</small></div>
        <div><span class="badge badge-exception">EXCEÇÃO</span></div>
      </div>`).join('');
  }

  const _renderDashboardV13 = renderDashboard;
  renderDashboard = function() {
    _renderDashboardV13();
    renderExcecoesDashboard();
  };

  document.addEventListener('click', function(e) {
    const item = e.target.closest('.exception-item[data-terceiro-id]');
    if (!item) return;
    const id = item.getAttribute('data-terceiro-id');
    if (id) abrirAnalise(id);
  });

  // ──────────────────────────────────────────────────
  //  V13.1 — Cards verticais + exceção com data até
  // ──────────────────────────────────────────────────
  (function configurarV131(){
    const css = document.createElement('style');
    css.textContent = `
      .terceiro-card-row td { padding: 10px 0 !important; background: transparent !important; }
      .terceiro-card { border: 1px solid var(--border); border-radius: 18px; background: #fff; padding: 16px; cursor: pointer; display: grid; gap: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.04); }
      .terceiro-card:hover { border-color: var(--accent); box-shadow: 0 6px 18px rgba(21,94,239,.10); }
      .terceiro-card-top { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
      .terceiro-card-name { font-size: 17px; font-weight: 800; color: var(--text); line-height: 1.15; }
      .terceiro-card-meta { color: var(--muted); font-size: 13px; margin-top:4px; line-height:1.35; }
      .terceiro-card-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .terceiro-card-info { background: var(--bg-soft, #F8FAFC); border:1px solid var(--border); border-radius:12px; padding:10px; }
      .terceiro-card-info label { font-size: 11px; text-transform: uppercase; letter-spacing:.5px; color:var(--muted); font-weight:700; margin:0 0 4px; }
      .terceiro-card-info div { font-size: 14px; color:var(--text); font-weight:600; }
      .terceiro-card-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .terceiro-card-hint { margin-left:auto; font-size:12px; color:var(--muted); }
      .exception-validity { background:#FEF3C7; border:1px solid #FBBF24; color:#92400E; border-radius:10px; padding:8px 10px; margin-top:8px; font-size:13px; }
      @media (max-width: 680px) {
        #page-listagem table thead { display:none; }
        #page-listagem table, #page-listagem tbody, #page-listagem tr, #page-listagem td { display:block; width:100%; }
        .terceiro-card-grid { grid-template-columns: 1fr; }
        .terceiro-card-top { flex-direction:column; }
        .terceiro-card-hint { margin-left:0; }
      }
    `;
    document.head.appendChild(css);
  })();

  function escapeHtmlSafeV131(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  // Exceção só libera quando está ativa e ainda está dentro da data "até".
  getExcecaoTerceiro = function(id) {
    const all = getAllExcecoes();
    const ex = all[id];
    if (!ex || !ex.ativo) return null;
    if (ex.dataAte && ex.dataAte < hoje()) return null;
    return ex;
  };

  salvarLiberacaoExcecao = async function(id) {
    const t = getAll().find(x => x.id === id);
    if (!t) return;

    const dataLiberacao = document.getElementById('exc-data')?.value || '';
    const dataAte = document.getElementById('exc-data-ate')?.value || '';
    const aprovador = document.getElementById('exc-aprovador')?.value.trim() || '';
    const cargo = document.getElementById('exc-cargo')?.value || '';
    const motivo = document.getElementById('exc-motivo')?.value || '';
    const obs = document.getElementById('exc-obs')?.value.trim() || '';

    if (!dataLiberacao || !dataAte || !aprovador || !cargo || !motivo) {
      toast('⚠ Preencha data da liberação, liberado até, aprovador, cargo e motivo.');
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
      dataLiberacao,
      dataAte,
      aprovador,
      cargo,
      motivo,
      obs,
      criadoEm: new Date().toISOString()
    };
    try { await window.tssExceptionStore.save(id, all[id]); }
    catch(e) { toast('⚠ A exceção não foi salva no banco.'); return; }
    registrarHistorico('terceiro', id, `Liberação por exceção registrada por ${aprovador} (${cargo}). Motivo: ${motivo}. De ${fmtData(dataLiberacao)} até ${fmtData(dataAte)}.`);
    toast('✓ Liberação por exceção registrada.');
    abrirAnalise(id);
    renderDashboard();
    if (document.getElementById('page-listagem')?.classList.contains('active')) renderLista();
  };

  renderExcecaoBox = function(id) {
    const ex = getExcecaoTerceiro(id);
    if (ex) {
      return `
        <div class="exception-box">
          <strong>🟡 Liberado por Exceção</strong>
          <div class="exception-active">
            <b>Data da liberação:</b> ${fmtData(ex.dataLiberacao)}<br>
            <b>Liberado até:</b> ${ex.dataAte ? fmtData(ex.dataAte) : 'Não informado'}<br>
            <b>Aprovador:</b> ${escapeHtmlSafeV131(ex.aprovador)}<br>
            <b>Cargo:</b> ${escapeHtmlSafeV131(ex.cargo)}<br>
            <b>Motivo:</b> ${escapeHtmlSafeV131(ex.motivo)}<br>
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
          <div><label>Cargo do aprovador *</label><select id="exc-cargo"><option value="">Selecione...</option><option>Gerente da Planta</option><option>Supervisor Industrial</option><option>Coordenador Industrial</option><option>Outro</option></select></div>
          <div><label>Motivo *</label><select id="exc-motivo"><option value="">Selecione...</option><option>ASO pendente</option><option>Integração pendente</option><option>Documento DP pendente</option><option>Emergência operacional</option><option>Outro</option></select></div>
          <div class="full"><label>Nome do aprovador *</label><input id="exc-aprovador" placeholder="Ex.: João da Silva"></div>
          <div class="full"><label>Observação</label><textarea id="exc-obs" placeholder="Explique a autorização..."></textarea></div>
        </div>
        <div class="exception-validity"><b>Regra:</b> o terceiro ficará como liberado por exceção somente até a data informada acima.</div>
        <div style="margin-top:12px;"><button class="btn btn-primary" onclick="salvarLiberacaoExcecao('${id}')">Liberar por Exceção</button></div>
      </div>`;
  };

  // Listagem em cards verticais clicáveis, própria para celular.
  renderLista = function() {
    atualizarStats();
    const buscaEl = document.getElementById('busca-lista');
    const filtroEl = document.getElementById('filtro-empresa-lista');
    const q = (buscaEl?.value || '').toLowerCase().trim();
    const empresaFiltro = filtroEl?.value || '';
    let lista = getAll();

    if (q) lista = lista.filter(t => correspondeBuscaTerceiroSST(q, t));
    if (empresaFiltro) lista = lista.filter(t => t.empresaId === empresaFiltro || t.empresa === empresaFiltro);

    const tbody = document.getElementById('tabela-body');
    const empty = document.getElementById('lista-empty');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!lista.length) {
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    lista.forEach(t => {
      const st = getStatus(t);
      const stDP = getStatusDP(t);
      const stSESMT = getStatusSESMT(t);
      const obrig = getTreinosObrigatoriosDaEmpresa(t.empresaId);
      const pendTreinos = obrig.filter(tr => !getStatusTreinamentoTerceiro(t, tr).ok).length;
      const badgeStatus = st.excecao
        ? '<span class="badge badge-exception">🟡 Exceção</span>'
        : (st.ok && !st.pendente ? '<span class="badge badge-ok">✓ Liberado</span>' : (st.pendente ? '<span class="badge badge-warn">Pendente</span>' : '<span class="badge badge-blocked">✕ Bloqueado</span>'));
      const badgeDP = stDP.ok ? '<span class="badge badge-ok">DP OK</span>' : '<span class="badge badge-blocked">DP</span>';
      const badgeSESMT = stSESMT.ok ? '<span class="badge badge-ok">SESMT OK</span>' : '<span class="badge badge-blocked">SESMT</span>';
      const badgeTreino = badgeTreinamentosComplementares(t);
      const ex = getExcecaoTerceiro(t.id);

      const tr = document.createElement('tr');
      tr.className = 'terceiro-card-row';
      tr.innerHTML = `
        <td colspan="10">
          <div class="terceiro-card" role="button" tabindex="0" data-terceiro-id="${t.id}" onclick="abrirAnalise('${t.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){abrirAnalise('${t.id}')}">
            <div class="terceiro-card-top">
              <div>
                <div class="terceiro-card-name">${escapeHtmlSafeV131(t.nome || 'Sem nome')}</div>
                <div class="terceiro-card-meta">${escapeHtmlSafeV131(t.empresa || 'Empresa não vinculada')} • ${escapeHtmlSafeV131(t.cpf || 'CPF não informado')}</div>
              </div>
              <div>${badgeStatus}</div>
            </div>
            <div class="terceiro-card-grid">
              <div class="terceiro-card-info"><label>Função</label><div>${escapeHtmlSafeV131(t.funcao || 'Não informada')}</div></div>
              <div class="terceiro-card-info"><label>ASO</label><div>${fmtData(t.aso)} ${tagData(t.aso)}</div></div>
              <div class="terceiro-card-info"><label>Integração</label><div>${fmtData(t.integ)} ${tagData(t.integ)}</div></div>
              <div class="terceiro-card-info"><label>Liberação</label><div>${ex ? 'Até ' + fmtData(ex.dataAte) : 'Sem exceção ativa'}</div></div>
            </div>
            <div class="terceiro-card-actions">
              ${badgeDP} ${badgeSESMT} ${badgeTreino}
              <span class="terceiro-card-hint">Toque para abrir ficha vertical</span>
            </div>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  };

  // Reforço: cards antigos também abrem a ficha.
  document.addEventListener('click', function(e) {
    const card = e.target.closest('[data-terceiro-id]');
    if (!card) return;
    const id = card.getAttribute('data-terceiro-id');
    if (id && !e.target.closest('button, a, input, select, textarea')) abrirAnalise(id);
  });

  // Portaria mostra também "liberado até" quando houver exceção.
  const _preencherResultadoPortariaV131 = preencherResultadoPortaria;
  preencherResultadoPortaria = function(found) {
    _preencherResultadoPortariaV131(found);
    const st = getStatus(found);
    if (!st.excecao) return;
    const motivosList = document.getElementById('r-motivos-list');
    if (motivosList && st.excecaoDados?.dataAte) {
      motivosList.insertAdjacentHTML('afterbegin', `<li><b>Liberado até:</b> ${fmtData(st.excecaoDados.dataAte)}</li>`);
    }
  };

  // Dashboard de exceções considera somente exceções ainda válidas.
  renderExcecoesDashboard = function() {
    const wrap = document.getElementById('dash-excecoes-list');
    if (!wrap) return;
    const all = getAllExcecoes();
    const itens = Object.values(all).filter(x => x && x.ativo && (!x.dataAte || x.dataAte >= hoje())).sort((a,b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
    if (!itens.length) {
      wrap.innerHTML = '<p style="font-size:14px;color:var(--muted);">Nenhuma liberação por exceção ativa.</p>';
      return;
    }
    wrap.innerHTML = itens.slice(0, 20).map(ex => `
      <div class="exception-item" role="button" tabindex="0" data-terceiro-id="${ex.terceiroId}" style="cursor:pointer;">
        <div><strong>${escapeHtmlSafeV131(ex.terceiro || 'Terceiro')}</strong><small>${escapeHtmlSafeV131(ex.empresa || 'Empresa não informada')} • ${escapeHtmlSafeV131(ex.cpf || 'CPF não informado')}</small><small>${escapeHtmlSafeV131(ex.motivo)} — ${fmtData(ex.dataLiberacao)} até ${ex.dataAte ? fmtData(ex.dataAte) : 'sem data final'}</small></div>
        <div><span class="badge badge-exception">EXCEÇÃO</span></div>
      </div>`).join('');
  };

  if (document.getElementById('page-listagem')?.classList.contains('active')) renderLista();


  // ──────────────────────────────────────────────────
  //  V16 — Upload de documentos + Dashboard inteligente
  // ──────────────────────────────────────────────────
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
  window.filtroStatusDashboard = window.filtroStatusDashboard || '';

  function labelFiltroStatus(status) {
    const labels = {
      todos: 'Todos os terceiros',
      liberados: 'Terceiros liberados',
      bloqueados: 'Terceiros bloqueados',
      excecoes: 'Liberados por exceção',
      pendentes: 'Terceiros pendentes'
    };
    return labels[status] || 'Terceiros cadastrados';
  }

  function aplicarFiltroStatusLista(lista) {
    const filtro = window.filtroStatusDashboard || '';
    if (!filtro || filtro === 'todos') return lista;
    return lista.filter(t => {
      const st = getStatus(t);
      if (filtro === 'liberados') return st.ok && !st.excecao && !st.pendente && !st.bloqueado;
      if (filtro === 'bloqueados') return st.bloqueado && !st.excecao;
      if (filtro === 'excecoes') return !!st.excecao;
      if (filtro === 'pendentes') return st.pendente && !st.excecao && !st.bloqueado;
      return true;
    });
  }

  function atualizarBannerFiltroStatus() {
    const filtro = window.filtroStatusDashboard || '';
    const banner = document.getElementById('status-filter-banner');
    const title = document.getElementById('status-filter-title');
    const sub = document.getElementById('status-filter-sub');
    const titulo = document.getElementById('titulo-listagem-terceiros');
    if (!banner) return;
    if (!filtro || filtro === 'todos') {
      banner.style.display = 'none';
      if (titulo) titulo.textContent = 'Terceiros Cadastrados';
      return;
    }
    const label = labelFiltroStatus(filtro);
    banner.style.display = 'block';
    if (title) title.textContent = label;
    if (sub) sub.textContent = 'Filtro aberto pelo Dashboard. Use limpar filtro para voltar à lista completa.';
    if (titulo) titulo.textContent = label;
  }

  function abrirListaPorStatus(status) {
    window.filtroStatusDashboard = status || 'todos';
    showPage('listagem');
    setTimeout(() => {
      const busca = document.getElementById('busca-lista');
      if (busca) busca.value = '';
      atualizarBannerFiltroStatus();
      renderLista();
    }, 50);
  }

  function limparFiltroStatusDashboard() {
    window.filtroStatusDashboard = '';
    atualizarBannerFiltroStatus();
    renderLista();
  }

  const _renderListaV19 = renderLista;
  renderLista = function() {
    atualizarBannerFiltroStatus();
    const filtroStatus = window.filtroStatusDashboard || '';
    if (!filtroStatus || filtroStatus === 'todos') {
      return _renderListaV19();
    }

    atualizarStats();
    const buscaEl = document.getElementById('busca-lista');
    const filtroEl = document.getElementById('filtro-empresa-lista');
    const q = (buscaEl?.value || '').toLowerCase().trim();
    const empresaFiltro = filtroEl?.value || '';
    let lista = getAll();

    if (q) lista = lista.filter(t => correspondeBuscaTerceiroSST(q, t));
    if (empresaFiltro) lista = lista.filter(t => t.empresaId === empresaFiltro || t.empresa === empresaFiltro);
    lista = aplicarFiltroStatusLista(lista);

    const tbody = document.getElementById('tabela-body');
    const empty = document.getElementById('lista-empty');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!lista.length) {
      if (empty) { empty.style.display = 'block'; empty.querySelector('p') && (empty.querySelector('p').textContent = 'Nenhum terceiro encontrado para este filtro.'); }
      return;
    }
    if (empty) empty.style.display = 'none';

    lista.forEach(t => {
      const st = getStatus(t);
      const stDP = getStatusDP(t);
      const stSESMT = getStatusSESMT(t);
      const obrig = getTreinosObrigatoriosDaEmpresa(t.empresaId);
      const pendTreinos = obrig.filter(tr => !getStatusTreinamentoTerceiro(t, tr).ok).length;
      const badgeStatus = st.excecao
        ? '<span class="badge badge-exception">🟡 Exceção</span>'
        : (st.ok && !st.pendente ? '<span class="badge badge-ok">✓ Liberado</span>' : (st.pendente ? '<span class="badge badge-warn">Pendente</span>' : '<span class="badge badge-blocked">✕ Bloqueado</span>'));
      const badgeDP = stDP.ok ? '<span class="badge badge-ok">DP OK</span>' : '<span class="badge badge-blocked">DP</span>';
      const badgeSESMT = stSESMT.ok ? '<span class="badge badge-ok">SESMT OK</span>' : '<span class="badge badge-blocked">SESMT</span>';
      const badgeTreino = badgeTreinamentosComplementares(t);
      const ex = getExcecaoTerceiro(t.id);

      const tr = document.createElement('tr');
      tr.className = 'terceiro-card-row';
      tr.innerHTML = `
        <td colspan="10">
          <div class="terceiro-card" role="button" tabindex="0" data-terceiro-id="${t.id}" onclick="abrirAnalise('${t.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){abrirAnalise('${t.id}')}">
            <div class="terceiro-card-top">
              <div>
                <div class="terceiro-card-name">${escapeHtmlSafeV131(t.nome || 'Sem nome')}</div>
                <div class="terceiro-card-meta">${escapeHtmlSafeV131(t.empresa || 'Empresa não vinculada')} • ${escapeHtmlSafeV131(t.cpf || 'CPF não informado')}</div>
              </div>
              <div>${badgeStatus}</div>
            </div>
            <div class="terceiro-card-grid">
              <div class="terceiro-card-info"><label>Função</label><div>${escapeHtmlSafeV131(t.funcao || 'Não informada')}</div></div>
              <div class="terceiro-card-info"><label>ASO</label><div>${fmtData(t.aso)} ${tagData(t.aso)}</div></div>
              <div class="terceiro-card-info"><label>Integração</label><div>${fmtData(t.integ)} ${tagData(t.integ)}</div></div>
              <div class="terceiro-card-info"><label>Liberação</label><div>${ex ? 'Até ' + fmtData(ex.dataAte) : 'Sem exceção ativa'}</div></div>
            </div>
            <div class="terceiro-card-actions">
              ${badgeDP} ${badgeSESMT} ${badgeTreino}
              <span class="terceiro-card-hint">Toque para abrir ficha vertical</span>
            </div>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js')
        .then(function () { console.log('Service Worker registrado.'); })
        .catch(function (error) { console.warn('Falha ao registrar Service Worker:', error); });
    });
  }

  // ──────────────────────────────────────────────────
  //  V16.1 — Exceção com múltiplos motivos/documentos
  // ──────────────────────────────────────────────────
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
  (function configurarV191DashboardInterativo(){
    const css = document.createElement('style');
    css.textContent = `
      #status-filter-banner { border-left: 5px solid var(--accent); }
      .stat-card.stat-click, #page-listagem .stat-card.stat-click { cursor: pointer; user-select: none; }
      .stat-card.stat-click:active, #page-listagem .stat-card.stat-click:active { transform: scale(.98); }
      .stat-card.active-filter { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(21,94,239,.12), var(--shadow-sm); }
    `;
    document.head.appendChild(css);
  })();

  function v191StatusKey(t) {
    const st = getStatus(t);
    if (st.excecao) return 'excecoes';
    if (st.pendente && !st.bloqueado) return 'pendentes';
    if (st.ok && !st.pendente && !st.bloqueado) return 'liberados';
    if (st.bloqueado) return 'bloqueados';
    return 'pendentes';
  }

  function v191FiltrarListaPorStatus(lista, status) {
    if (!status || status === 'todos') return lista;
    return lista.filter(t => v191StatusKey(t) === status);
  }

  function v191LabelStatus(status) {
    return ({
      todos: 'Todos os terceiros',
      liberados: 'Terceiros liberados',
      bloqueados: 'Terceiros bloqueados',
      pendentes: 'Terceiros pendentes',
      excecoes: 'Liberados por exceção'
    })[status] || 'Terceiros cadastrados';
  }

  function v191ContagensStatus(lista) {
    const c = { todos: lista.length, liberados:0, bloqueados:0, pendentes:0, excecoes:0 };
    lista.forEach(t => { const k = v191StatusKey(t); if (c[k] !== undefined) c[k]++; });
    return c;
  }

  function v191AplicarAcoesCards() {
    const mapDash = [
      ['dash-total','todos'],
      ['dash-liberados','liberados'],
      ['dash-bloqueados','bloqueados'],
      ['dash-excecoes','excecoes'],
      ['dash-pendentes','pendentes']
    ];
    mapDash.forEach(([id,status]) => {
      const el = document.getElementById(id);
      const card = el && el.closest('.stat-card');
      if (!card) return;
      card.classList.add('stat-click');
      card.setAttribute('role','button');
      card.setAttribute('tabindex','0');
      card.dataset.statusFiltro = status;
      if (!card.querySelector('.stat-hint')) {
        const hint = document.createElement('span');
        hint.className = 'stat-hint';
        hint.textContent = status === 'todos' ? 'Toque para ver todos' : `Toque para ver ${v191LabelStatus(status).toLowerCase()}`;
        card.appendChild(hint);
      }
    });

    const mapList = [
      ['stat-total','todos'],
      ['stat-liberados','liberados'],
      ['stat-bloqueados','bloqueados']
    ];
    mapList.forEach(([id,status]) => {
      const el = document.getElementById(id);
      const card = el && el.closest('.stat-card');
      if (!card) return;
      card.classList.add('stat-click');
      card.setAttribute('role','button');
      card.setAttribute('tabindex','0');
      card.dataset.statusFiltro = status;
    });
  }

  document.addEventListener('click', function(e){
    const card = e.target.closest('[data-status-filtro]');
    if (!card) return;
    const status = card.dataset.statusFiltro || 'todos';
    abrirListaPorStatus(status);
  }, true);

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-status-filtro]');
    if (!card) return;
    e.preventDefault();
    abrirListaPorStatus(card.dataset.statusFiltro || 'todos');
  }, true);

  abrirListaPorStatus = function(status) {
    window.filtroStatusDashboard = status || 'todos';
    const busca = document.getElementById('busca-lista');
    if (busca) busca.value = '';
    const filtroEmpresa = document.getElementById('filtro-empresa-lista');
    if (filtroEmpresa) filtroEmpresa.value = '';
    showPage('listagem');
    setTimeout(function(){
      atualizarBannerFiltroStatus();
      renderLista();
      const alvo = document.getElementById('status-filter-banner') || document.getElementById('page-listagem');
      if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({ behavior:'smooth', block:'start' });
    }, 30);
  };

  atualizarBannerFiltroStatus = function() {
    const filtro = window.filtroStatusDashboard || '';
    const banner = document.getElementById('status-filter-banner');
    const title = document.getElementById('status-filter-title');
    const sub = document.getElementById('status-filter-sub');
    const titulo = document.getElementById('titulo-listagem-terceiros');
    if (!banner) return;
    const label = v191LabelStatus(filtro || 'todos');
    if (!filtro || filtro === 'todos') {
      banner.style.display = 'none';
      if (titulo) titulo.textContent = 'Terceiros Cadastrados';
    } else {
      banner.style.display = 'block';
      if (title) title.textContent = label;
      if (sub) sub.textContent = 'Filtro aplicado pelo Dashboard. A lista abaixo mostra somente este grupo.';
      if (titulo) titulo.textContent = label;
    }
    document.querySelectorAll('[data-status-filtro]').forEach(c => c.classList.toggle('active-filter', (c.dataset.statusFiltro || '') === filtro && filtro !== 'todos'));
  };

  limparFiltroStatusDashboard = function() {
    window.filtroStatusDashboard = '';
    const busca = document.getElementById('busca-lista');
    if (busca) busca.value = '';
    atualizarBannerFiltroStatus();
    renderLista();
  };

  const _renderDashboardV191 = renderDashboard;
  renderDashboard = function() {
    _renderDashboardV191();
    setTimeout(v191AplicarAcoesCards, 10);
  };

  const _renderListaV191Base = renderLista;
  renderLista = function() {
    const filtroStatus = window.filtroStatusDashboard || '';
    if (!filtroStatus || filtroStatus === 'todos') {
      const r = _renderListaV191Base();
      setTimeout(function(){ atualizarBannerFiltroStatus(); v191AplicarAcoesCards(); }, 10);
      return r;
    }

    atualizarStats();
    atualizarBannerFiltroStatus();
    v191AplicarAcoesCards();

    const buscaEl = document.getElementById('busca-lista');
    const filtroEl = document.getElementById('filtro-empresa-lista');
    const q = (buscaEl?.value || '').toLowerCase().trim();
    const empresaFiltro = filtroEl?.value || '';
    let lista = getAll();

    if (q) lista = lista.filter(t => correspondeBuscaTerceiroSST(q, t));
    if (empresaFiltro) lista = lista.filter(t => t.empresaId === empresaFiltro || t.empresa === empresaFiltro);
    lista = v191FiltrarListaPorStatus(lista, filtroStatus);

    // No filtro ativo, os cards superiores passam a refletir somente a lista exibida.
    const c = v191ContagensStatus(lista);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-total', lista.length);
    set('stat-liberados', c.liberados);
    set('stat-bloqueados', c.bloqueados);
    set('stat-empresas', new Set(lista.map(t => t.empresa || t.empresaId).filter(Boolean)).size);

    const tbody = document.getElementById('tabela-body');
    const empty = document.getElementById('lista-empty');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!lista.length) {
      if (empty) {
        empty.style.display = 'block';
        const p = empty.querySelector('p');
        if (p) p.textContent = 'Nenhum terceiro encontrado para este filtro.';
      }
      return;
    }
    if (empty) empty.style.display = 'none';

    lista.forEach(t => {
      const st = getStatus(t);
      const stDP = getStatusDP(t);
      const stSESMT = getStatusSESMT(t);
      const obrig = getTreinosObrigatoriosDaEmpresa(t.empresaId);
      const pendTreinos = obrig.filter(tr => !getStatusTreinamentoTerceiro(t, tr).ok).length;
      const badgeStatus = st.excecao
        ? '<span class="badge badge-exception">🟡 Exceção</span>'
        : (st.ok && !st.pendente ? '<span class="badge badge-ok">✓ Liberado</span>' : (st.pendente ? '<span class="badge badge-warn">Pendente</span>' : '<span class="badge badge-blocked">✕ Bloqueado</span>'));
      const badgeDP = stDP.ok ? '<span class="badge badge-ok">DP OK</span>' : '<span class="badge badge-blocked">DP</span>';
      const badgeSESMT = stSESMT.ok ? '<span class="badge badge-ok">SESMT OK</span>' : '<span class="badge badge-blocked">SESMT</span>';
      const badgeTreino = badgeTreinamentosComplementares(t);
      const ex = getExcecaoTerceiro(t.id);

      const tr = document.createElement('tr');
      tr.className = 'terceiro-card-row';
      tr.innerHTML = `
        <td colspan="10">
          <div class="terceiro-card" role="button" tabindex="0" data-terceiro-id="${t.id}" onclick="abrirAnalise('${t.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){abrirAnalise('${t.id}')}">
            <div class="terceiro-card-top">
              <div>
                <div class="terceiro-card-name">${escapeHtmlSafeV131(t.nome || 'Sem nome')}</div>
                <div class="terceiro-card-meta">${escapeHtmlSafeV131(t.empresa || 'Empresa não vinculada')} • ${escapeHtmlSafeV131(t.cpf || 'CPF não informado')}</div>
              </div>
              <div>${badgeStatus}</div>
            </div>
            <div class="terceiro-card-grid">
              <div class="terceiro-card-info"><label>Função</label><div>${escapeHtmlSafeV131(t.funcao || 'Não informada')}</div></div>
              <div class="terceiro-card-info"><label>ASO</label><div>${fmtData(t.aso)} ${tagData(t.aso)}</div></div>
              <div class="terceiro-card-info"><label>Integração</label><div>${fmtData(t.integ)} ${tagData(t.integ)}</div></div>
              <div class="terceiro-card-info"><label>Liberação</label><div>${ex ? 'Até ' + fmtData(ex.dataAte) : 'Sem exceção ativa'}</div></div>
            </div>
            <div class="terceiro-card-actions">
              ${badgeDP} ${badgeSESMT} ${badgeTreino}
              <span class="terceiro-card-hint">Toque para abrir ficha vertical</span>
            </div>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  };

  setTimeout(function(){ try { v191AplicarAcoesCards(); atualizarBannerFiltroStatus(); } catch(e) { console.warn('V19.1 dashboard:', e); } }, 120);



  // ──────────────────────────────────────────────────
  //  V21 — Painel de Empresa + Alertas automáticos interativos
  // ──────────────────────────────────────────────────
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

