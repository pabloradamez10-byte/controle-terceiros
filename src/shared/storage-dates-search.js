
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
