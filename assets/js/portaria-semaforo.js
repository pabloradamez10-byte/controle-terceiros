
(function(){
  function byId(id){ return document.getElementById(id); }
  function nrm(v){ return (v || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
  function soDig(v){ return (v || '').toString().replace(/\D/g,''); }
  function all(){ return typeof getAll === 'function' ? getAll() : []; }
  function fmt(iso){ return typeof fmtData === 'function' ? fmtData(iso) : (iso || '—'); }
  function emp(t){ return typeof getEmpresaById === 'function' ? (getEmpresaById(t.empresaId) || {}) : {}; }
  function stDate(iso){
    if (typeof statusData === 'function') return statusData(iso);
    if (!iso) return {classe:'neutral', label:'Sem data', texto:'Data não informada', semData:true};
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const d = new Date(iso+'T00:00:00');
    if (isNaN(d)) return {classe:'neutral', label:'Sem data', texto:'Data não informada', semData:true};
    const dias = Math.round((d-hoje)/86400000);
    if (dias < 0) return {classe:'blocked', label:'Vencido', texto:'Vencido', dias};
    if (dias <= 30) return {classe:'warn', label:'Vencendo', texto:'Vence em '+dias+' dia(s)', dias};
    return {classe:'ok', label:'OK', texto:'Válido', dias};
  }
  function status(t){
    const s = typeof getStatus === 'function' ? getStatus(t) : {ok:false,motivos:['Não foi possível calcular o status.'],avisos:[]};
    if (s.confirmado===false) return {classe:'blocked',titulo:'NÃO CONFIRMADO',sub:'Atualize a consulta online antes de autorizar acesso',simbolo:'?',s:s,status:s};
    if (s.excecao) return {classe:'warn', titulo:'LIBERADO POR EXCEÇÃO', sub:'Acesso permitido por autorização registrada', simbolo:'!', s:s};
    if (s.ok) return {classe:'ok', titulo:'LIBERADO', sub: s.pendente ? 'Acesso permitido — possui pendências/avisos' : 'Acesso permitido', simbolo:'✓', s:s};
    return {classe:'blocked', titulo:'BLOQUEADO', sub:'Acesso não autorizado', simbolo:'×', s:s};
  }
  function linhaSemaforo(nome, iso, extra){
    const st = stDate(iso);
    const cls = st.classe || 'neutral';
    const texto = st.semData ? 'SEM DATA' : (cls === 'blocked' ? 'VENCIDO' : (cls === 'warn' ? 'VENCENDO' : 'OK'));
    const detalhe = st.semData ? 'Data não informada' : ((st.texto || '') + (extra ? ' • '+extra : ''));
    return '<div class="v24-semaforo-row '+cls+'"><div><strong>'+nome+'</strong><small style="display:block;color:var(--muted);margin-top:3px;">'+detalhe+'</small></div><span>'+texto+'</span></div>';
  }
  function treinosRows(t){
    let html = '';
    try {
      const obrig = typeof getTreinosObrigatoriosDaEmpresa === 'function' ? getTreinosObrigatoriosDaEmpresa(t.empresaId) : [];
      obrig.slice(0,10).forEach(function(tr){
        const reg = (t.treinamentosRealizados || []).find(function(x){ return x.treinamentoId === tr.id; });
        const dataBase = reg && reg.data ? reg.data : '';
        const venc = (typeof addMonths === 'function' && dataBase) ? addMonths(dataBase, tr.validade || 12) : '';
        if (dataBase) html += '<div class="v24-semaforo-row"><span>Treinamento adicional</span><div>' + escapeTrainingText(tr.nome || 'Treinamento') + ' — realizado em ' + fmt(dataBase) + '</div></div>';
      });
    } catch(e) {}
    return html;
  }
  function filtrar(q){
    const lista = all();
    const dig = soDig(q);
    const txt = nrm(q);
    if (!txt && !dig) return [];
    if (dig.length >= 5) {
      const exatos = lista.filter(function(t){ return soDig(t.cpf) === dig; });
      if (exatos.length) return exatos;
      const parciais = lista.filter(function(t){ return soDig(t.cpf).includes(dig); });
      if (parciais.length) return parciais;
    }
    const partes = txt.split(/\s+/).filter(Boolean);
    return lista.filter(function(t){
      const base = nrm((t.nome||'')+' '+(t.empresa||'')+' '+(t.funcao||'')+' '+(t.cpf||''));
      return partes.every(function(p){ return base.includes(p); });
    });
  }
  function renderDetalhe(t){
    window.sstSelectedPersonId=t.id;
    const box = byId('v24-result');
    const matches = byId('v24-matches');
    if (matches) { matches.style.display = 'none'; matches.innerHTML = ''; }
    if (!box) return;
    const e = emp(t);
    const se = status(t);
    const motivos = (se.s && se.s.motivos) ? se.s.motivos : [];
    const avisos = (se.s && se.s.avisos) ? se.s.avisos : [];
    const ex = (se.s && se.s.excecaoDados) ? se.s.excecaoDados : null;
    const excecaoHtml = ex ? '<div class="v24-motivos warn"><strong>Liberação por exceção</strong><ul>'+
      '<li>Autorização: '+(ex.numeroAutorizacao || '—')+'</li>'+
      '<li>Aprovador: '+(ex.aprovador || '—')+(ex.cargo ? ' • '+ex.cargo : '')+'</li>'+
      '<li>Liberado até: '+(ex.dataAte ? fmt(ex.dataAte) : '—')+'</li>'+
      ((ex.motivos || []).map(function(m){ return '<li>'+m+'</li>'; }).join(''))+
      '</ul></div>' : '';
    const problemas = motivos.length || avisos.length ? '<div class="v24-motivos '+(motivos.length ? '' : 'warn')+'"><strong>'+(motivos.length ? 'Motivos do bloqueio' : 'Pendências / avisos não bloqueantes')+'</strong><ul>'+motivos.concat(avisos).slice(0,15).map(function(m){ return '<li>'+m+'</li>'; }).join('')+'</ul></div>' : '';
    box.innerHTML = '<div class="v24-status-head">'+
      '<div class="v24-status-icon '+se.classe+'">'+se.simbolo+'</div>'+
      '<div><div class="v24-status-title '+se.classe+'">'+se.titulo+'</div><div class="v24-status-sub">'+se.sub+'</div></div></div>'+
      '<div class="v24-info-grid">'+
      '<div class="v24-info"><small>Nome</small><strong>'+(t.nome || '—')+'</strong></div>'+
      '<div class="v24-info"><small>CPF</small><strong>'+(t.cpf || 'Sem CPF')+'</strong></div>'+
      '<div class="v24-info"><small>Empresa</small><strong>'+(t.empresa || e.razao || e.fantasia || '—')+'</strong></div>'+
      '<div class="v24-info"><small>Função</small><strong>'+(t.funcao || '—')+'</strong></div>'+
      '</div><div class="v24-semaforo">'+
      linhaSemaforo('ASO', t.aso)+
      linhaSemaforo('Integração', t.integ)+
      linhaSemaforo('Contrato da empresa', e.contratoFim)+
      linhaSemaforo('Documentos DP', e.docDPValidade)+
      linhaSemaforo('Documentos SESMT', e.docSESMTValidade)+
      treinosRows(t)+
      '</div>'+excecaoHtml+problemas+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">'+
      '<button class="btn btn-ghost" onclick="abrirAnaliseTerceiro(\''+t.id+'\')">Abrir ficha completa</button>'+
      '<button class="btn btn-primary" onclick="showPage(\'listagem\')">Ver lista de terceiros</button></div>';
    box.classList.add('show');
  }
  function renderMatches(lista){
    const matches = byId('v24-matches');
    const box = byId('v24-result');
    if (box) { box.classList.remove('show'); box.innerHTML = ''; }
    if (!matches) return;
    if (!lista.length) { matches.style.display='none'; matches.innerHTML=''; return; }
    matches.innerHTML = lista.slice(0,40).map(function(t){
      const se = status(t);
      return '<button class="v24-match-card '+se.classe+'" onclick="v242AbrirExpress(\''+t.id+'\')">'+
        '<strong>'+(t.nome || 'Sem nome')+'</strong>'+
        '<small>'+(t.empresa || 'Sem empresa')+' • '+(t.funcao || 'Sem função')+' • '+(t.cpf || 'Sem CPF')+'</small>'+
        '<span class="v24-status-chip '+se.classe+'">'+se.titulo+'</span>'+
      '</button>';
    }).join('') + (lista.length > 40 ? '<div class="v24-auto-note">Mostrando os 40 primeiros. Refine a busca para reduzir a lista.</div>' : '');
    matches.style.display = 'grid';
  }
  window.v242AbrirExpress = function(id){
    const t = all().find(function(x){ return x.id === id; });
    if (t) renderDetalhe(t);
  };
  window.v24ConsultarExpress = function(){
    const q = (byId('v24-busca') && byId('v24-busca').value) || '';
    const lista = filtrar(q);
    if (!lista.length) { renderMatches([]); const box=byId('v24-result'); if(box){box.classList.remove('show'); box.innerHTML='';} if(typeof toast==='function') toast('Nenhum terceiro encontrado.'); return; }
    if (lista.length === 1) renderDetalhe(lista[0]); else renderMatches(lista);
  };
  function init(){
    const input = byId('v24-busca');
    if (input && !input.dataset.v242) {
      input.dataset.v242 = '1';
      let timer = null;
      input.addEventListener('input', function(){
        clearTimeout(timer);
        timer = setTimeout(function(){ if ((input.value || '').trim().length >= 3) window.v24ConsultarExpress(); }, 250);
      });
      const cardTitle = input.closest('.card') && input.closest('.card').querySelector('.card-title');
      if (cardTitle && !byId('v24-hint')) {
        const hint = document.createElement('div');
        hint.id = 'v24-hint';
        hint.className = 'v24-express-hint';
        hint.textContent = 'Digite 3 ou mais caracteres para buscar automaticamente. Toque em um resultado para abrir o semáforo completo.';
        cardTitle.insertAdjacentElement('afterend', hint);
      }
    }
  }
  const oldShow = window.showPage;
  if (typeof oldShow === 'function' && !window.__v242ShowPatch) {
    window.__v242ShowPatch = true;
    window.showPage = function(name){ oldShow(name); if (name === 'portaria-express') setTimeout(init, 100); };
  }
  setTimeout(init, 500);
})();
