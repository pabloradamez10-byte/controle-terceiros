
(function(){
  function nrm(v){ return (v || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
  function soDig(v){ return (v || '').toString().replace(/\D/g,''); }
  function byId(id){ return document.getElementById(id); }

  function criarPaginaPortariaExpress(){
    if (byId('page-portaria-express')) return;
    const main = document.querySelector('main');
    if (!main) return;
    const div = document.createElement('div');
    div.id = 'page-portaria-express';
    div.className = 'page';
    div.innerHTML = `
      <h2>Portaria Express</h2>
      <div class="card v24-portaria-card">
        <div class="card-title">Consulta rápida por CPF ou nome</div>
        <div class="v24-portaria-search">
          <input id="v24-busca" type="text" placeholder="Digite CPF, nome ou empresa..." oninput="window.v24AutoBusca && window.v24AutoBusca()" onkeydown="if(event.key==='Enter') v24ConsultarExpress()" />
          <button class="btn btn-primary" onclick="v24ConsultarExpress()">Consultar</button>
        </div>
        <div id="v24-matches" class="v24-match-list" style="display:none;"></div>
        <div id="v24-result" class="v24-status-box"></div>
      </div>
    `;
    main.appendChild(div);
  }

  function adicionarNavPortariaExpress(){
    const nav = document.querySelector('header nav');
    if (!nav || nav.querySelector('[data-v24-portaria]')) return;
    const btn = document.createElement('button');
    btn.textContent = 'Portaria Express';
    btn.dataset.v24Portaria = '1';
    btn.onclick = () => window.showPage('portaria-express');
    nav.appendChild(btn);
  }

  function stData(iso){
    if (typeof statusData === 'function') return statusData(iso);
    if (!iso) return {classe:'neutral',label:'Sem data',texto:'Data não informada',semData:true};
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const d = new Date(iso+'T00:00:00');
    if (isNaN(d)) return {classe:'neutral',label:'Sem data',texto:'Data não informada',semData:true};
    const dias = Math.round((d-hoje)/86400000);
    if (dias < 0) return {classe:'blocked',label:'Vencido',texto:'Vencido',dias};
    if (dias <= 30) return {classe:'warn',label:'Vencendo',texto:`Vence em ${dias} dia(s)`,dias};
    return {classe:'ok',label:'OK',texto:'Válido',dias};
  }

  function fmt(iso){ return (typeof fmtData === 'function') ? fmtData(iso) : (iso || '—'); }

  function linhaSemaforo(nome, iso, extra){
    const st = stData(iso);
    const cls = st.classe || 'neutral';
    const texto = st.semData ? 'SEM DATA' : (cls === 'blocked' ? 'VENCIDO' : (cls === 'warn' ? 'VENCENDO' : 'OK'));
    const detalhe = st.semData ? 'Data não informada' : `${st.texto || ''}${extra ? ' • '+extra : ''}`;
    return `<div class="v24-semaforo-row ${cls}"><div><strong>${nome}</strong><small style="display:block;color:var(--muted);margin-top:3px;">${detalhe}</small></div><span>${texto}</span></div>`;
  }

  function statusExpress(t){
    const s = (typeof getStatus === 'function') ? getStatus(t) : {ok:false,motivos:['Não foi possível calcular status'],avisos:[]};
    if (s.confirmado===false) return {classe:'blocked',titulo:'NÃO CONFIRMADO',sub:'Atualize a consulta online antes de autorizar acesso',simbolo:'?',s:s,status:s};
    if (s.excecao) return {classe:'warn', titulo:'LIBERADO POR EXCEÇÃO', sub:'Acesso permitido por autorização registrada', simbolo:'!', status:s};
    if (s.ok) return {classe:'ok', titulo:'LIBERADO', sub: s.pendente ? 'Acesso permitido — possui pendências/avisos' : 'Acesso permitido', simbolo:'✓', status:s};
    return {classe:'blocked', titulo:'BLOQUEADO', sub:'Acesso não autorizado', simbolo:'×', status:s};
  }

  function getEmpresa(t){
    if (typeof getEmpresaById === 'function') return getEmpresaById(t.empresaId) || {};
    return {};
  }

  function treinosRows(t){
    const rows = [];
    try {
      const obrig = typeof getTreinosObrigatoriosDaEmpresa === 'function' ? getTreinosObrigatoriosDaEmpresa(t.empresaId) : [];
      obrig.slice(0, 8).forEach(tr => {
        let reg = (t.treinamentosRealizados || []).find(x => x.treinamentoId === tr.id);
        let dataBase = reg?.data || '';
        let venc = '';
        if (typeof addMonths === 'function' && dataBase) venc = addMonths(dataBase, tr.validade || 12);
        if (dataBase) rows.push('<div class="v24-semaforo-row"><span>Treinamento adicional</span><div>' + escapeTrainingText(tr.nome || 'Treinamento') + ' — realizado em ' + fmt(dataBase) + '</div></div>');
      });
    } catch(e) {}
    return rows.join('');
  }

  function renderExpress(t){
    window.sstSelectedPersonId=t.id;
    const res = byId('v24-result');
    const matches = byId('v24-matches');
    if (matches) { matches.style.display='none'; matches.innerHTML=''; }
    if (!res) return;
    const emp = getEmpresa(t);
    const se = statusExpress(t);
    const st = se.status || {};
    const motivos = (st.motivos || []);
    const avisos = (st.avisos || []);
    const exception = st.excecaoDados || null;
    const exceptionHtml = exception ? `
      <div class="v24-motivos warn">
        <strong>Liberação por exceção</strong>
        <ul>
          <li>Autorização: ${exception.numeroAutorizacao || '—'}</li>
          <li>Aprovador: ${exception.aprovador || '—'} ${exception.cargo ? '• '+exception.cargo : ''}</li>
          <li>Liberado até: ${exception.dataAte ? fmt(exception.dataAte) : '—'}</li>
          ${(exception.motivos || []).map(m => `<li>${m}</li>`).join('')}
        </ul>
      </div>` : '';
    const problemasHtml = (motivos.length || avisos.length) ? `
      <div class="v24-motivos ${motivos.length ? '' : 'warn'}">
        <strong>${motivos.length ? 'Motivos / impedimentos' : 'Pendências / avisos não bloqueantes'}</strong>
        <ul>${[...motivos, ...avisos].slice(0,12).map(m => `<li>${m}</li>`).join('')}</ul>
      </div>` : '';
    res.innerHTML = `
      <div class="v24-status-head">
        <div class="v24-status-icon ${se.classe}">${se.simbolo}</div>
        <div><div class="v24-status-title ${se.classe}">${se.titulo}</div><div class="v24-status-sub">${se.sub}</div></div>
      </div>
      <div class="v24-info-grid">
        <div class="v24-info"><small>Nome</small><strong>${t.nome || '—'}</strong></div>
        <div class="v24-info"><small>CPF</small><strong>${t.cpf || 'Sem CPF'}</strong></div>
        <div class="v24-info"><small>Empresa</small><strong>${t.empresa || emp.razao || emp.fantasia || '—'}</strong></div>
        <div class="v24-info"><small>Função</small><strong>${escapeHtmlSafeV131(t.funcao || '—')}</strong></div>
      </div>
      <div class="v24-semaforo">
        ${linhaSemaforo('ASO', t.aso)}
        ${linhaSemaforo('Integração', t.integ)}
        ${linhaSemaforo('Contrato da empresa', emp.contratoFim)}
        ${linhaSemaforo('Documentos DP', emp.docDPValidade)}
        ${linhaSemaforo('Documentos SESMT', emp.docSESMTValidade)}
        ${treinosRows(t)}
      </div>
      ${exceptionHtml}
      ${problemasHtml}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
        <button class="btn btn-ghost" onclick="abrirAnaliseTerceiro('${t.id}')">Abrir ficha completa</button>
        <button class="btn btn-primary" onclick="showPage('listagem')">Ver lista de terceiros</button>
      </div>`;
    res.classList.add('show');
  }

  function buscar(q){
    const lista = typeof getAll === 'function' ? getAll() : [];
    const dig = soDig(q);
    const txt = nrm(q);
    if (!txt && !dig) return [];
    if (dig.length >= 5) {
      const exact = lista.filter(t => soDig(t.cpf) === dig);
      if (exact.length) return exact;
      const parcial = lista.filter(t => soDig(t.cpf).includes(dig));
      if (parcial.length) return parcial;
    }
    const partes = txt.split(/\s+/).filter(Boolean);
    return lista.filter(t => {
      const base = nrm(`${t.nome||''} ${t.empresa||''} ${t.funcao||''}`);
      return partes.every(p => base.includes(p));
    });
  }

  window.v24ConsultarExpress = function(){
    const q = byId('v24-busca')?.value || '';
    const res = byId('v24-result');
    const matches = byId('v24-matches');
    if (res) { res.classList.remove('show'); res.innerHTML=''; }
    if (matches) { matches.style.display='none'; matches.innerHTML=''; }
    const found = buscar(q);
    if (!found.length) { if (typeof toast === 'function') toast('Nenhum terceiro encontrado.'); return; }
    if (found.length === 1) return renderExpress(found[0]);
    if (matches) {
      matches.innerHTML = found.slice(0,30).map(t => {
        const se = statusExpress(t);
        return `<button class="v24-match-card" onclick="v24AbrirExpress('${t.id}')"><strong>${t.nome || 'Sem nome'}</strong><small>${escapeHtmlSafeV131(t.empresa || 'Sem empresa')} • ${t.funcao || 'Sem função'} • ${t.cpf || 'Sem CPF'} • ${se.titulo}</small></button>`;
      }).join('');
      matches.style.display='grid';
    }
    if (typeof toast === 'function') toast(`Encontramos ${found.length} registros. Selecione o correto.`);
  };

  window.v24AbrirExpress = function(id){
    const t = (typeof getAll === 'function' ? getAll() : []).find(x => x.id === id);
    if (t) renderExpress(t);
  };

  function initV24(){
    criarPaginaPortariaExpress();
    adicionarNavPortariaExpress();
  }

  const oldShow = window.showPage;
  if (typeof oldShow === 'function') {
    window.showPage = function(name){
      initV24();
      oldShow(name);
    };
  }
  setTimeout(initV24, 250);
})();
