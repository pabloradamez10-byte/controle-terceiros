/* Documentos assistidos: leitura local, sugestões revisáveis, sem liberação automática. */
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const keys = {terceiro:'arquivosTerceirosV16', empresa:'arquivosEmpresasV26'};
  const types = {terceiro:['ASO','Integração','Certificado NR','Ficha EPI','Contrato/Ficha Registro','CNH','Documento DP','Outro'], empresa:['Contrato de prestação','CNPJ','Alvará','PGR','PCMSO','Documento DP','Documento SESMT','Outro']};
  const canEdit = () => window.tssPode?.('cadastrar') === true;
  const canView = () => canEdit() || window.tssPode?.('liberar') === true;
  const records = (kind, id) => JSON.parse(localStorage.getItem(keys[kind]) || '{}')[id] || [];
  const notice = text => typeof toast === 'function' ? toast(text) : alert(text);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  let active = null, sequence = 0, reading = false, pdfModule = null, tesseractReady = null;

  function classify(text, kind) {
    const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const rules = kind === 'empresa' ? [
      ['PCMSO', /\bPCMSO\b|PROGRAMA DE CONTROLE MEDICO/], ['PGR', /\bPGR\b|PROGRAMA DE GERENCIAMENTO DE RISCOS/],
      ['CNPJ', /COMPROVANTE DE INSCRICAO E DE SITUACAO CADASTRAL/], ['Alvará', /ALVARA/], ['Contrato de prestação', /CONTRATO DE PRESTACAO/]
    ] : [
      ['ASO', /\bASO\b|ATESTADO DE SAUDE OCUPACIONAL/], ['Ficha EPI', /FICHA.{0,35}(EPI|EQUIPAMENTO DE PROTECAO)|ENTREGA DE EPI/],
      ['Integração', /INTEGRACAO/], ['CNH', /CARTEIRA NACIONAL DE HABILITACAO/], ['Certificado NR', /\bNR\s*[-–]?\s*\d{1,2}\b/],
      ['Contrato/Ficha Registro', /FICHA DE REGISTRO|CONTRATO DE TRABALHO/]
    ];
    const matched = rules.filter(([, rule]) => rule.test(normalized));
    const date = text.match(/(?:validade|v[aá]lido\s+at[eé]|vencimento)\s*[:\-]?\s*(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})/i);
    let validade = '';
    if (date) {
      const iso = `${date[3]}-${date[2]}-${date[1]}`;
      const parsed = new Date(iso + 'T12:00:00Z');
      if (!Number.isNaN(+parsed) && parsed.toISOString().slice(0,10) === iso) validade = iso;
    }
    const cpf = text.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
    const nome = text.match(/(?:nome\s*(?:do\s*(?:trabalhador|colaborador|funcion[aá]rio))?|trabalhador|funcion[aá]rio)\s*:\s*([^\n\r]{3,100})/i);
    return {tipo:matched.length === 1 ? matched[0][0] : '', validade, cpf:cpf?.[0] || '', nome:nome?.[1]?.trim() || '', ambiguo:matched.length > 1};
  }
  window.sstDocumentosClassificar = classify;

  async function save(kind, id, items) {
    if (!canEdit()) throw new Error('Seu perfil não permite alterar documentos.');
    const all = JSON.parse(localStorage.getItem(keys[kind]) || '{}');
    all[id] = items;
    localStorage.setItem(keys[kind], JSON.stringify(all));
    localStorage.setItem('tss_local_last_change', new Date().toISOString());
    if (typeof window.tssSupabaseSyncNow !== 'function' || !await window.tssSupabaseSyncNow()) {
      throw new Error('Documento guardado neste navegador, mas não foi possível confirmar a sincronização. Não feche a página; recarregue o banco após verificar a conexão.');
    }
  }

  function status(item) {
    if (item.validade && item.validade < today()) return 'Vencido';
    return item.conferidoEm ? 'Conferido' : 'A conferir';
  }

  function mount(kind, id) {
    const box = document.getElementById(kind === 'terceiro' ? 'v16-doc-section' : 'v26-doc-empresa-section');
    if (!box) return;
    if (!canView()) { box.remove(); return; }
    const generation = ++sequence;
    active = {kind, id, generation};
    const items = records(kind, id);
    box.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><strong>Documentos ${kind === 'terceiro' ? 'do terceiro' : 'da empresa'}</strong><span id="sst-doc-summary">${items.length} anexo(s) · ${items.filter(a => !a.conferidoEm).length} a conferir</span></div>
      <p class="v26-doc-owner-note">Anexe, leia e confira o documento. Os dados sugeridos não alteram a liberação de acesso.</p>
      ${canEdit() ? `<div class="v16-doc-form">
        <div class="full"><label for="sst-doc-file">PDF ou imagem · até 900 KB por arquivo</label><input id="sst-doc-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp"></div>
        <div class="full" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button id="sst-doc-read" type="button" class="btn btn-ghost">Ler documento e sugerir campos</button><span id="sst-doc-progress" role="status" aria-live="polite"></span></div>
        <div><label for="sst-doc-type">Tipo de documento</label><select id="sst-doc-type"><option value="">Selecione ou use a leitura</option>${types[kind].map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
        <div><label for="sst-doc-expiry">Validade informada no documento</label><input id="sst-doc-expiry" type="date"></div>
        <div class="full" id="sst-doc-findings" style="display:none;padding:12px;background:#eff6ff;border-radius:10px;font-size:13px;white-space:pre-line"></div>
        <div class="full"><label for="sst-doc-note">Observação</label><input id="sst-doc-note" maxlength="500" placeholder="Informações para quem fará a conferência"></div>
        <div class="full"><details><summary>Texto reconhecido para conferência</summary><textarea id="sst-doc-text" readonly rows="6" style="width:100%;margin-top:8px" aria-label="Texto reconhecido"></textarea></details></div>
        <div class="full"><button id="sst-doc-save" type="button" class="btn btn-primary">Salvar anexo · a conferir</button></div>
      </div>` : ''}
      <div style="display:flex;gap:8px;margin:16px 0;flex-wrap:wrap"><input id="sst-doc-search" aria-label="Buscar documentos" placeholder="Buscar por nome, tipo ou observação" style="flex:1;min-width:180px"><select id="sst-doc-filter" aria-label="Filtrar situação"><option value="">Todas as situações</option><option>A conferir</option><option>Conferido</option><option>Vencido</option></select></div>
      <div id="sst-doc-list" class="v16-doc-list"></div>`;
    const el = name => box.querySelector('#sst-doc-' + name);
    let draft = null;
    function renderList() {
      const query = el('search').value.toLocaleLowerCase('pt-BR'), filter = el('filter').value;
      const current = records(kind,id);
      el('summary').textContent = `${current.length} anexo(s) · ${current.filter(a => !a.conferidoEm).length} a conferir`;
      const filtered = current.filter(a => (!filter || status(a) === filter) && `${a.nome} ${a.tipo} ${a.obs || ''}`.toLocaleLowerCase('pt-BR').includes(query));
      el('list').innerHTML = filtered.length ? filtered.map(a => `<div class="v16-doc-item" data-document-id="${esc(a.id)}"><div><strong>${esc(a.tipo)} — ${esc(a.nome)}</strong><small>${esc(status(a))}${a.validade ? ' · Validade: ' + esc(a.validade.split('-').reverse().join('/')) : ' · Validade não informada'} · ${Math.round((a.tamanho || 0)/1024)} KB</small><small>${a.leituraMetodo ? 'Leitura assistida · ' : ''}${a.conferidoEm ? 'Conferido em ' + esc(new Date(a.conferidoEm).toLocaleString('pt-BR')) : 'Conferência pendente'}${a.conferidoPor ? ' · ' + esc(a.conferidoPor) : ''}</small>${a.obs ? `<small>${esc(a.obs)}</small>` : ''}</div><div class="v26-doc-actions"><button type="button" class="btn btn-primary" data-action="view">Ver</button><button type="button" class="btn btn-ghost" data-action="download">Baixar</button>${canEdit() ? `<button type="button" class="btn btn-ghost" data-action="review">${a.conferidoEm ? 'Reabrir conferência' : 'Conferir'}</button><button type="button" class="btn btn-danger" data-action="remove">Remover</button>` : ''}</div></div>`).join('') : '<p class="v26-doc-owner-note">Nenhum documento encontrado.</p>';
    }
    el('search').oninput = renderList; el('filter').onchange = renderList;
    el('list').onclick = async event => {
      const button = event.target.closest('[data-action]'), row = button?.closest('[data-document-id]');
      if (!row) return;
      const list = records(kind,id), item = list.find(a => a.id === row.dataset.documentId);
      if (!item || !canView()) return;
      if (button.dataset.action === 'view') return window.v26VisualizarDataUrl(item.dataUrl,item.mime,item.nome);
      if (button.dataset.action === 'download') {
        const a = document.createElement('a'); a.href = item.dataUrl; a.download = item.nome; a.click(); return;
      }
      if (!canEdit()) return;
      if (button.dataset.action === 'remove') {
        if (!confirm('Remover este documento anexado?')) return;
        button.disabled = true;
        try { await save(kind,id,list.filter(a => a.id !== item.id)); registrarHistorico(kind,id,'Documento removido: ' + item.tipo + ' — ' + item.nome); renderList(); }
        catch(error) { notice(error.message); } finally { button.disabled = false; }
        return;
      }
      if (!item.conferidoEm) {
        window.v26VisualizarDataUrl(item.dataUrl,item.mime,item.nome);
        const preview = Array.from(document.querySelectorAll('.v26-doc-preview')).pop();
        if (!preview) return;
        const form = document.createElement('form');
        form.style.cssText = 'padding:12px 16px;border-top:1px solid #ddd;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
        form.innerHTML = '<label style="flex:1">Responsável pela conferência<input required maxlength="100" name="responsavel" placeholder="Seu nome" style="display:block;width:100%"></label><button type="submit" class="btn btn-primary">Confirmar conferência do original</button><small style="width:100%">Esta conferência não altera a liberação de acesso.</small>';
        preview.appendChild(form);
        form.onsubmit = async event => {
          event.preventDefault();
          if (!canEdit()) return notice('Seu perfil não permite alterar documentos.');
          const reviewer = form.querySelector('input').value.trim();
          if (!reviewer) return;
          const current = records(kind,id), documentItem = current.find(a => a.id === item.id);
          if (!documentItem) return notice('Documento não encontrado.');
          documentItem.conferidoEm = new Date().toISOString(); documentItem.conferidoPor = reviewer;
          const submit = form.querySelector('button'); submit.disabled = true;
          try { await save(kind,id,current); registrarHistorico(kind,id,'Documento conferido: ' + item.tipo + ' — responsável informado: ' + reviewer); preview.closest('.v26-doc-preview-overlay').remove(); renderList(); }
          catch(error) { notice(error.message); } finally { submit.disabled = false; }
        };
        return;
      } else {
        if (!confirm('Reabrir a conferência deste documento?')) return;
        delete item.conferidoEm; delete item.conferidoPor;
      }
      button.disabled = true;
      try { await save(kind,id,list); registrarHistorico(kind,id,'Conferência documental atualizada: ' + item.tipo); renderList(); }
      catch(error) { notice(error.message); } finally { button.disabled = false; }
    };
    renderList();
    if (!canEdit()) return;
    el('file').onchange = () => {
      draft = null; el('text').value = ''; el('findings').style.display = 'none';
      el('type').value = ''; el('expiry').value = ''; el('progress').textContent = '';
    };
    el('read').onclick = async () => {
      if (reading) { notice('Aguarde a leitura em andamento.'); return; }
      const file = el('file').files[0];
      if (!file) return notice('Selecione um PDF ou imagem.');
      if (file.size > 900000) return notice('Use um arquivo de até 900 KB.');
      draft = null;
      reading = true; el('read').disabled = true; el('save').disabled = true; el('file').disabled = true;
      const report = message => { if (active?.generation === generation) el('progress').textContent = message; };
      try {
        const result = await readDocument(file,report);
        if (active?.generation !== generation) return;
        if (!canEdit()) throw new Error('Sua sessão não permite esta operação.');
        if (!result.text.trim()) throw new Error('Não foi possível reconhecer texto. Você pode escolher o tipo e anexar manualmente.');
        const suggestion = classify(result.text,kind);
        draft = {file,text:result.text,method:result.method};
        el('text').value = result.text;
        el('type').value = suggestion.tipo; el('expiry').value = suggestion.validade;
        const person = kind === 'terceiro' && typeof getAll === 'function' ? getAll().find(a => a.id === id) : null;
        const mismatch = person?.cpf && suggestion.cpf && person.cpf.replace(/\D/g,'') !== suggestion.cpf.replace(/\D/g,'');
        el('findings').textContent = ['Sugestões: confira com o original antes de salvar.', suggestion.tipo ? 'Tipo identificado: ' + suggestion.tipo : suggestion.ambiguo ? 'Mais de um tipo encontrado. Selecione o tipo correto.' : 'Tipo não identificado. Selecione manualmente.', suggestion.nome ? 'Nome encontrado: ' + suggestion.nome : '', suggestion.cpf ? 'CPF encontrado: ' + suggestion.cpf : '', mismatch ? 'ATENÇÃO: o CPF encontrado difere do cadastro selecionado.' : '', suggestion.validade ? 'Validade localizada no texto. Confira a data.' : 'Validade não identificada. Não calculamos prazo a partir da data do exame.', result.warning || ''].filter(Boolean).join('\n');
        el('findings').style.display = 'block'; report('Leitura concluída · conferência necessária');
      } catch(error) { report('Leitura não concluída'); notice(error.message || 'Falha na leitura. Anexe manualmente.'); }
      finally { reading = false; if (active?.generation === generation) { el('read').disabled = false; el('save').disabled = false; el('file').disabled = false; } }
    };
    el('save').onclick = async () => {
      if (!canEdit()) return;
      const file = el('file').files[0], tipo = el('type').value;
      if (!file || !tipo) return notice('Selecione um arquivo e o tipo do documento.');
      if (file.size > 900000) return notice('Use um arquivo de até 900 KB.');
      if (!/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) return notice('Formato permitido: PDF, PNG, JPG ou WEBP.');
      const list = records(kind,id);
      if (list.some(a => a.nome === file.name && a.tamanho === file.size) && !confirm('Já existe um arquivo com este nome e tamanho. Anexar novamente?')) return;
      el('save').disabled = true;
      try {
        const dataUrl = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Não foi possível abrir o arquivo.')); reader.readAsDataURL(file); });
        if (active?.generation !== generation) return;
        list.unshift({id:uid(),donoTipo:kind,donoId:id,tipo,validade:el('expiry').value,obs:el('note').value.trim(),nome:file.name,tamanho:file.size,mime:file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),dataUrl,criadoEm:new Date().toISOString(),leituraMetodo:draft?.file === file ? draft.method : ''});
        await save(kind,id,list);
        registrarHistorico(kind,id,'Documento anexado para conferência: ' + tipo + ' — ' + file.name);
        notice('Documento salvo e sincronizado. Conferência pendente.'); mount(kind,id);
      } catch(error) { notice(error.name === 'QuotaExceededError' ? 'Espaço do navegador insuficiente. O documento não foi salvo.' : error.message); }
      finally { if (active?.generation === generation) el('save').disabled = false; }
    };
  }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (!tesseractReady) tesseractReady = new Promise((resolve,reject) => {
      const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
      script.onload = resolve; script.onerror = () => { script.remove(); tesseractReady = null; reject(new Error('Não foi possível carregar a leitura de imagens. Verifique a conexão ou anexe manualmente.')); }; document.head.appendChild(script);
    });
    return tesseractReady;
  }

  async function readDocument(file,report) {
    let worker = null, pdf = null;
    async function ocr(image) {
      report('Preparando leitura de imagem…'); await loadTesseract();
      if (!worker) worker = await Tesseract.createWorker('por',1,{logger: m => { if (m.status === 'recognizing text') report('Reconhecendo texto: ' + Math.round(m.progress*100) + '%'); }});
      return (await worker.recognize(image)).data.text;
    }
    try {
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        report('Abrindo PDF…');
        if (!pdfModule) pdfModule = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
        pdfModule.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
        pdf = await pdfModule.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
        const pages = Math.min(pdf.numPages,5), texts = [];
        let usedOCR = false;
        for (let n=1;n<=pages;n++) {
          report(`Lendo página ${n} de ${pages}…`);
          const page = await pdf.getPage(n), content = await page.getTextContent();
          let text = content.items.map(i => i.str + (i.hasEOL ? '\n' : ' ')).join('');
          if (text.trim().length < 30) {
            usedOCR = true;
            const base = page.getViewport({scale:1}), scale = Math.min(2,2000/Math.max(base.width,base.height));
            const viewport = page.getViewport({scale}), canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
            text = await ocr(canvas); canvas.width = 0; canvas.height = 0;
          }
          texts.push(text); page.cleanup();
        }
        return {text:texts.join('\n\n'),method:usedOCR ? 'PDF + OCR' : 'Texto do PDF',warning:pdf.numPages > 5 ? 'Leitura limitada às 5 primeiras páginas; confira o restante manualmente.' : ''};
      }
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Leitura disponível para PDF, PNG, JPG e WEBP.');
      return {text:await ocr(file),method:'OCR de imagem'};
    } finally { if (worker) await worker.terminate(); if (pdf) await pdf.destroy(); }
  }

  const originalAnalysis = window.abrirAnalise;
  window.abrirAnalise = function(id) { const result = originalAnalysis.apply(this,arguments); mount('terceiro',id); return result; };
  if (typeof window.abrirPainelEmpresaV21 === 'function') {
    const originalCompany = window.abrirPainelEmpresaV21;
    window.abrirPainelEmpresaV21 = function(id) { const result = originalCompany.apply(this,arguments); mount('empresa',id); return result; };
  }
})();
