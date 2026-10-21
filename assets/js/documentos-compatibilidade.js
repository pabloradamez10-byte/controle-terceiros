
/* V24.3 - Correção busca automática Portaria e Portaria Express */
(function(){
  let timerExpress = null;
  let timerPortaria = null;

  function valor(id){
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
  }

  window.v24AutoBusca = function(){
    clearTimeout(timerExpress);
    timerExpress = setTimeout(function(){
      const q = valor('v24-busca');
      if (q.length >= 3 && typeof window.v24ConsultarExpress === 'function') {
        window.v24ConsultarExpress();
      }
      if (q.length < 3) {
        const matches = document.getElementById('v24-matches');
        const result = document.getElementById('v24-result');
        if (matches) { matches.style.display = 'none'; matches.innerHTML = ''; }
        if (result) { result.classList.remove('show'); result.innerHTML = ''; }
      }
    }, 180);
  };

  window.portariaAutoBusca = function(){
    clearTimeout(timerPortaria);
    timerPortaria = setTimeout(function(){
      const q = valor('busca-portaria');
      if (q.length >= 3 && typeof window.consultarPortaria === 'function') {
        window.consultarPortaria();
      }
      if (q.length < 3) {
        const result = document.getElementById('portaria-result');
        const matches = document.getElementById('portaria-matches');
        const nf = document.getElementById('portaria-not-found');
        if (result) result.classList.remove('show');
        if (matches) { matches.style.display='none'; matches.innerHTML=''; }
        if (nf) nf.classList.remove('show');
      }
    }, 180);
  };

  document.addEventListener('input', function(ev){
    if (!ev || !ev.target) return;
    if (ev.target.id === 'v24-busca') window.v24AutoBusca();
    if (ev.target.id === 'busca-portaria') window.portariaAutoBusca();
  }, true);

  function ligarInputs(){
    const express = document.getElementById('v24-busca');
    if (express && !express.dataset.autoBuscaOk) {
      express.dataset.autoBuscaOk = '1';
      express.addEventListener('input', window.v24AutoBusca);
    }
    const portaria = document.getElementById('busca-portaria');
    if (portaria && !portaria.dataset.autoBuscaOk) {
      portaria.dataset.autoBuscaOk = '1';
      portaria.addEventListener('input', window.portariaAutoBusca);
    }
  }

  const oldShow = window.showPage;
  if (typeof oldShow === 'function' && !window.__v243BuscaPatch) {
    window.__v243BuscaPatch = true;
    window.showPage = function(name){
      oldShow(name);
      setTimeout(ligarInputs, 120);
    };
  }

  setTimeout(ligarInputs, 300);
  setTimeout(ligarInputs, 900);
})();


/* ======================================================
   V26 LIMPA — Documentos vinculados a terceiro/empresa
   - Sem painel Supabase visível no app.
   - Documento nunca fica avulso: sempre pertence a um terceiro ou empresa.
   - Botões: Ver | Baixar | Remover.
   Observação: esta etapa mantém armazenamento local para teste; o caminho do
   Supabase/Storage privado será conectado depois, sem aparecer para usuário.
====================================================== */
(function(){
  const V26_EMP_DOC_KEY = 'arquivosEmpresasV26';

  function esc(v){
    if (typeof escapeHtmlSafeV131 === 'function') return escapeHtmlSafeV131(v);
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function fmt(iso){ return typeof fmtData === 'function' ? fmtData(iso) : (iso || '—'); }
  function mkId(){ return typeof uid === 'function' ? uid() : ('id-' + Date.now() + '-' + Math.random().toString(16).slice(2)); }
  function msg(t){ if (typeof toast === 'function') toast(t); else alert(t); }

  function ensureV26Style(){
    if (document.getElementById('v26-clean-style')) return;
    const st = document.createElement('style');
    st.id = 'v26-clean-style';
    st.textContent = `
      .v26-doc-owner-note{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.45}
      .v26-doc-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
      .v26-doc-actions .btn{padding:6px 10px;font-size:12px}
      .v26-doc-preview-overlay{position:fixed;inset:0;background:rgba(15,23,42,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px}
      .v26-doc-preview{background:var(--surface,#fff);border-radius:22px;width:min(920px,96vw);max-height:92vh;overflow:hidden;box-shadow:0 30px 80px rgba(15,23,42,.35);display:flex;flex-direction:column}
      .v26-doc-preview-head{padding:14px 16px;border-bottom:1px solid var(--border,#dde5f0);display:flex;justify-content:space-between;align-items:center;gap:10px}
      .v26-doc-preview-head strong{font-size:15px;line-height:1.2;word-break:break-word}
      .v26-doc-preview-body{padding:14px;overflow:auto;text-align:center;background:#f8fafc}
      .v26-doc-preview-body img{max-width:100%;height:auto;border-radius:14px;box-shadow:0 8px 24px rgba(15,23,42,.12)}
      .v26-doc-preview-body iframe{width:100%;height:72vh;border:0;border-radius:14px;background:#fff}
      .v26-doc-empresa-section{margin-top:16px}
      @media(max-width:700px){.v26-doc-preview{width:96vw}.v26-doc-preview-body iframe{height:68vh}}
    `;
    document.head.appendChild(st);
  }

  function downloadDataUrl(dataUrl, nome){
    const link = document.createElement('a');
    link.href = window.sstSafeDocumentURL(dataUrl);
    link.download = nome || 'documento';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  window.v26VisualizarDataUrl = function(dataUrl, mime, nome){
    ensureV26Style();
    if (!dataUrl) { msg('Documento não encontrado.'); return; }
    try {dataUrl=window.sstSafeDocumentURL(dataUrl);}catch(error){msg(error.message);return;}
    const tipo = (mime || '').toLowerCase();
    const overlay = document.createElement('div');
    overlay.className = 'v26-doc-preview-overlay';
    let corpo = '';
    if (tipo.startsWith('image/')) {
      corpo = `<img src="${dataUrl}" alt="${esc(nome || 'Documento')}" />`;
    } else if (tipo === 'application/pdf' || String(nome || '').toLowerCase().endsWith('.pdf')) {
      corpo = `<iframe src="${dataUrl}" title="${esc(nome || 'PDF')}"></iframe>`;
    } else {
      corpo = `<div style="padding:30px;text-align:left;background:#fff;border-radius:14px;">
        <h3 style="margin:0 0 8px;">Visualização não disponível para este tipo de arquivo</h3>
        <p style="color:var(--muted);margin:0 0 14px;">Use o botão baixar para abrir este documento no aplicativo adequado.</p>
        <button class="btn btn-primary" onclick="v26BaixarTemp()">Baixar arquivo</button>
      </div>`;
      window.v26BaixarTemp = () => downloadDataUrl(dataUrl, nome);
    }
    overlay.innerHTML = `<div class="v26-doc-preview">
      <div class="v26-doc-preview-head"><strong>${esc(nome || 'Documento')}</strong><button class="btn btn-ghost" onclick="this.closest('.v26-doc-preview-overlay').remove()">Fechar</button></div>
      <div class="v26-doc-preview-body">${corpo}</div>
    </div>`;
    overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  };

  window.visualizarArquivoTerceiroV26 = function(terceiroId, arqId){
    const a = (typeof getArquivosTerceiroV16 === 'function' ? getArquivosTerceiroV16(terceiroId) : []).find(x => x.id === arqId);
    if (!a) { msg('Documento do terceiro não encontrado.'); return; }
    v26VisualizarDataUrl(a.dataUrl, a.mime, a.nome);
  };

  window.baixarArquivoTerceiroV26 = function(terceiroId, arqId){
    const a = (typeof getArquivosTerceiroV16 === 'function' ? getArquivosTerceiroV16(terceiroId) : []).find(x => x.id === arqId);
    if (!a) { msg('Documento do terceiro não encontrado.'); return; }
    downloadDataUrl(a.dataUrl, a.nome);
  };

  function getArquivosEmpresaV26(id){
    return JSON.parse(localStorage.getItem(V26_EMP_DOC_KEY) || '{}')[id] || [];
  }
  function saveArquivosEmpresaV26(id, arquivos){
    const all = JSON.parse(localStorage.getItem(V26_EMP_DOC_KEY) || '{}');
    all[id] = arquivos;
    localStorage.setItem(V26_EMP_DOC_KEY, JSON.stringify(all));
  }
  window.getArquivosEmpresaV26 = getArquivosEmpresaV26;

  window.adicionarArquivoEmpresaV26 = function(id){
    const tipo = document.getElementById('v26-emp-doc-tipo')?.value || 'Documento da empresa';
    const validade = document.getElementById('v26-emp-doc-validade')?.value || '';
    const obs = document.getElementById('v26-emp-doc-obs')?.value.trim() || '';
    const input = document.getElementById('v26-emp-doc-file');
    const file = input?.files?.[0];
    if (!id) { msg('Empresa não localizada.'); return; }
    if (!file) { msg('Selecione um arquivo da empresa.'); return; }
    if (file.size > 900000) { msg('Arquivo muito grande para teste local. Use até 900 KB.'); return; }
    const reader = new FileReader();
    reader.onload = function(){
      const arquivos = getArquivosEmpresaV26(id);
      arquivos.unshift({ id: mkId(), donoTipo:'empresa', donoId:id, tipo, validade, obs, nome:file.name, tamanho:file.size, mime:file.type || 'application/octet-stream', dataUrl:reader.result, criadoEm:new Date().toISOString() });
      saveArquivosEmpresaV26(id, arquivos);
      if (typeof registrarHistorico === 'function') registrarHistorico('empresa', id, `Documento da empresa anexado: ${tipo} - ${file.name}${validade ? ' | validade ' + fmt(validade) : ''}.`);
      msg('Documento da empresa anexado.');
      if (typeof abrirPainelEmpresaV21 === 'function') abrirPainelEmpresaV21(id);
    };
    reader.readAsDataURL(file);
  };

  window.removerArquivoEmpresaV26 = function(id, arqId){
    if (!confirm('Remover este documento da empresa?')) return;
    saveArquivosEmpresaV26(id, getArquivosEmpresaV26(id).filter(a => a.id !== arqId));
    if (typeof registrarHistorico === 'function') registrarHistorico('empresa', id, 'Documento da empresa removido.');
    if (typeof abrirPainelEmpresaV21 === 'function') abrirPainelEmpresaV21(id);
  };

  window.visualizarArquivoEmpresaV26 = function(id, arqId){
    const a = getArquivosEmpresaV26(id).find(x => x.id === arqId);
    if (!a) { msg('Documento da empresa não encontrado.'); return; }
    v26VisualizarDataUrl(a.dataUrl, a.mime, a.nome);
  };

  window.baixarArquivoEmpresaV26 = function(id, arqId){
    const a = getArquivosEmpresaV26(id).find(x => x.id === arqId);
    if (!a) { msg('Documento da empresa não encontrado.'); return; }
    downloadDataUrl(a.dataUrl, a.nome);
  };

  function renderDocsTerceiroV26(id){
    const arquivos = typeof getArquivosTerceiroV16 === 'function' ? getArquivosTerceiroV16(id) : [];
    return `<div class="analysis-section" id="v16-doc-section">
      <strong>Documentos digitais do terceiro</strong>
      <p class="v26-doc-owner-note">Todo documento anexado aqui fica vinculado obrigatoriamente a este terceiro. Não existe documento avulso.</p>
      <div class="v16-doc-form">
        <div><label>Tipo de documento</label><select id="v16-doc-tipo"><option>ASO</option><option>Integração</option><option>Certificado NR</option><option>Ficha EPI</option><option>Contrato/Ficha Registro</option><option>CNH</option><option>Documento DP</option><option>Outro</option></select></div>
        <div><label>Validade, se houver</label><input id="v16-doc-validade" type="date"></div>
        <div class="full"><label>Arquivo</label><input class="file-input" id="v16-doc-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"></div>
        <div class="full"><label>Observação</label><input id="v16-doc-obs" placeholder="Ex.: ASO renovado conforme solicitação do SESMT"></div>
        <div class="full"><button class="btn btn-primary" onclick="adicionarArquivoTerceiroV16('${id}')">Anexar documento ao terceiro</button></div>
      </div>
      <div class="v16-doc-list">
        ${arquivos.length ? arquivos.map(a => `<div class="v16-doc-item">
          <div><strong>${esc(a.tipo)} — ${esc(a.nome)}</strong><small>${a.validade ? 'Validade: ' + fmt(a.validade) + ' • ' : ''}Anexado em ${new Date(a.criadoEm).toLocaleString('pt-BR')}</small>${a.obs ? `<small>${esc(a.obs)}</small>` : ''}</div>
          <div class="v26-doc-actions"><button class="btn btn-primary" onclick="visualizarArquivoTerceiroV26('${id}','${a.id}')">Ver</button><button class="btn btn-ghost" onclick="baixarArquivoTerceiroV26('${id}','${a.id}')">Baixar</button><button class="btn btn-danger" onclick="removerArquivoTerceiroV16('${id}','${a.id}')">Remover</button></div>
        </div>`).join('') : '<p style="font-size:13px;color:var(--muted);margin-top:8px;">Nenhum documento digital anexado a este terceiro.</p>'}
      </div>
    </div>`;
  }

  function renderDocsEmpresaV26(id){
    const arquivos = getArquivosEmpresaV26(id);
    return `<div class="card v26-doc-empresa-section" id="v26-doc-empresa-section">
      <div class="card-title">Documentos digitais da empresa</div>
      <p class="v26-doc-owner-note">Todo documento anexado aqui fica vinculado obrigatoriamente a esta empresa. Use para contrato, CNPJ, alvará, PGR/PCMSO, documentos DP/SESMT e outros.</p>
      <div class="v16-doc-form">
        <div><label>Tipo de documento</label><select id="v26-emp-doc-tipo"><option>Contrato de prestação</option><option>CNPJ</option><option>Alvará</option><option>PGR</option><option>PCMSO</option><option>Documento DP</option><option>Documento SESMT</option><option>Outro</option></select></div>
        <div><label>Validade, se houver</label><input id="v26-emp-doc-validade" type="date"></div>
        <div class="full"><label>Arquivo</label><input class="file-input" id="v26-emp-doc-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"></div>
        <div class="full"><label>Observação</label><input id="v26-emp-doc-obs" placeholder="Ex.: contrato atualizado"></div>
        <div class="full"><button class="btn btn-primary" onclick="adicionarArquivoEmpresaV26('${id}')">Anexar documento à empresa</button></div>
      </div>
      <div class="v16-doc-list">
        ${arquivos.length ? arquivos.map(a => `<div class="v16-doc-item">
          <div><strong>${esc(a.tipo)} — ${esc(a.nome)}</strong><small>${a.validade ? 'Validade: ' + fmt(a.validade) + ' • ' : ''}Anexado em ${new Date(a.criadoEm).toLocaleString('pt-BR')}</small>${a.obs ? `<small>${esc(a.obs)}</small>` : ''}</div>
          <div class="v26-doc-actions"><button class="btn btn-primary" onclick="visualizarArquivoEmpresaV26('${id}','${a.id}')">Ver</button><button class="btn btn-ghost" onclick="baixarArquivoEmpresaV26('${id}','${a.id}')">Baixar</button><button class="btn btn-danger" onclick="removerArquivoEmpresaV26('${id}','${a.id}')">Remover</button></div>
        </div>`).join('') : '<p style="font-size:13px;color:var(--muted);margin-top:8px;">Nenhum documento digital anexado a esta empresa.</p>'}
      </div>
    </div>`;
  }

  const oldAbrirAnalise = window.abrirAnalise || abrirAnalise;
  window.abrirAnalise = abrirAnalise = function(id){
    oldAbrirAnalise(id);
    ensureV26Style();
    const box = document.getElementById('analise-conteudo');
    if (!box) return;
    const oldSec = document.getElementById('v16-doc-section');
    if (oldSec) oldSec.remove();
    box.insertAdjacentHTML('beforeend', renderDocsTerceiroV26(id));
  };
  window.abrirAnaliseTerceiro = function(id){ return window.abrirAnalise(id); };

  if (typeof abrirPainelEmpresaV21 === 'function') {
    const oldPainel = window.abrirPainelEmpresaV21 || abrirPainelEmpresaV21;
    window.abrirPainelEmpresaV21 = abrirPainelEmpresaV21 = function(id){
      oldPainel(id);
      ensureV26Style();
      const box = document.getElementById('v21-empresa-conteudo');
      if (!box) return;
      const old = document.getElementById('v26-doc-empresa-section');
      if (old) old.remove();
      box.insertAdjacentHTML('beforeend', renderDocsEmpresaV26(id));
    };
  }
})();
