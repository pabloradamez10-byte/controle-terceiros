/* Documentos assistidos: leitura local, sugestões revisáveis, sem liberação automática. */
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const keys = {terceiro:'arquivosTerceirosV16', empresa:'arquivosEmpresasV26'};
  const types = {terceiro:['ASO','Integração','Certificado NR','Ficha EPI','Contrato/Ficha Registro','CNH','Documento DP','Outro'], empresa:['Contrato de prestação','CNPJ','Alvará','PGR','PCMSO','Documento DP','Documento SESMT','Outro']};
  const canEdit = () => window.tssPode?.('cadastrar') === true;
  const canView = () => window.sstNativeMode ? window.tssPode?.('consultar') === true : canEdit() || window.tssPode?.('liberar') === true;
  const canDownload = () => typeof window.sstCanDownloadDocuments !== 'function' || window.sstCanDownloadDocuments();
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
    const performed = text.match(/(?:data\s*(?:de\s*)?(?:realiza[cç][aã]o|conclus[aã]o|treinamento)|realizado\s+em)\s*[:\-]?\s*(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})/i);
    const performedISO = performed ? `${performed[3]}-${performed[2]}-${performed[1]}` : '';
    const nrNumbers = [...new Set(Array.from(normalized.matchAll(/\bNR\s*[-–]?\s*0*(\d{1,2})\b/g), m => String(Number(m[1]))))];
    return {tipo:matched.length === 1 ? matched[0][0] : '', validade, dataRealizacao:validDate(performedISO) ? performedISO : '', nrNumero:nrNumbers.length === 1 ? nrNumbers[0] : '', cpf:cpf?.[0] || '', nome:nome?.[1]?.trim() || '', ambiguo:matched.length > 1};
  }
  window.sstDocumentosClassificar = classify;

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const parsed = new Date(value + 'T12:00:00Z');
    return !Number.isNaN(+parsed) && parsed.toISOString().slice(0,10) === value;
  }
  const dateLabel = value => value ? value.split('-').reverse().join('/') : 'Não informada';
  function buildUpdate(person, item, selection, trainings) {
    if (!person) throw new Error('Terceiro não encontrado.');
    const next = JSON.parse(JSON.stringify(person));
    let field, before, after;
    if (item.tipo === 'ASO' || item.tipo === 'Integração') {
      field = item.tipo === 'ASO' ? 'aso' : 'integ';
      if (!validDate(selection.validade)) throw new Error('Informe a validade conferida no documento.');
      before = person[field] || ''; after = selection.validade; next[field] = after;
    } else if (item.tipo === 'Certificado NR') {
      const training = trainings.find(t => t.id === selection.treinamentoId && t.ativo !== false);
      if (!training) throw new Error('Selecione o treinamento correspondente ao certificado.');
      const nr = String(training.nome || '').match(/\bNR\s*[-–]?\s*0*(\d{1,2})\b/i);
      if (item.nrNumero && (!nr || Number(nr[1]) !== Number(item.nrNumero))) throw new Error('A NR selecionada difere da NR identificada no documento.');
      if (!validDate(selection.dataRealizacao) || selection.dataRealizacao > today()) throw new Error('Informe a data de realização válida, sem data futura.');
      const list = next.treinamentosRealizados || [];
      const index = list.findIndex(t => t.treinamentoId === training.id);
      before = index >= 0 ? list[index].data || '' : ''; after = selection.dataRealizacao;
      const record = {...(index >= 0 ? list[index] : {}),treinamentoId:training.id,data:after,documentoId:item.id};
      if (index >= 0) list[index] = record; else list.push(record);
      next.treinamentosRealizados = list; field = 'Treinamento: ' + training.nome;
    } else throw new Error('Este tipo de documento não atualiza datas automaticamente.');
    const label = field === 'aso' ? 'Validade ASO' : field === 'integ' ? 'Validade integração' : field + ' (realização)';
    return {person:next,field,before,after,label};
  }
  window.sstDocumentosPlanejarAtualizacao = buildUpdate;

  async function save(kind, id, items, update, historyText) {
    if (!canEdit()) throw new Error('Seu perfil não permite alterar documentos.');
    const all = JSON.parse(localStorage.getItem(keys[kind]) || '{}');
    all[id] = items;
    let peopleJSON = null;
    if (update) {
      if (kind !== 'terceiro' || update.person.id !== id) throw new Error('Vínculo do documento inválido.');
      const people = typeof getAll === 'function' ? getAll() : [];
      if (!people.some(t => t.id === id)) throw new Error('Terceiro não encontrado.');
      peopleJSON = JSON.stringify(people.map(t => t.id === id ? update.person : t));
    }
    const documentsJSON = JSON.stringify(all), oldDocuments = localStorage.getItem(keys[kind]), oldPeople = localStorage.getItem('terceiros');
    try {
      localStorage.setItem(keys[kind], documentsJSON);
      if (peopleJSON !== null) localStorage.setItem('terceiros',peopleJSON);
    } catch(error) {
      if (oldDocuments !== null) localStorage.setItem(keys[kind],oldDocuments); else localStorage.removeItem(keys[kind]);
      if (update && oldPeople !== null) localStorage.setItem('terceiros',oldPeople);
      throw error;
    }
    if (historyText && typeof registrarHistorico === 'function') registrarHistorico(kind,id,historyText);
    localStorage.setItem('tss_local_last_change', new Date().toISOString());
    if (typeof window.tssSupabaseSyncNow !== 'function' || !await window.tssSupabaseSyncNow()) {
      throw new Error('Alteração não confirmada no banco. Se você cancelou o motivo, os dados anteriores foram restaurados. Caso contrário, verifique a conexão e recarregue o banco antes de tentar novamente.');
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
      <p class="v26-doc-owner-note">Anexe, leia e confira o documento. Na conferência, você pode aplicar a data ao cadastro; o sistema recalcula as pendências pelas regras existentes.</p>
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
      el('list').innerHTML = filtered.length ? filtered.map(a => `<div class="v16-doc-item" data-document-id="${esc(a.id)}"><div><strong>${esc(a.tipo)} — ${esc(a.nome)}</strong><small>${esc(status(a))}${a.validade ? ' · Validade: ' + esc(a.validade.split('-').reverse().join('/')) : ' · Validade não informada'} · ${Math.round((a.tamanho || 0)/1024)} KB</small><small>${a.leituraMetodo ? 'Leitura assistida · ' : ''}${a.conferidoEm ? 'Conferido em ' + esc(new Date(a.conferidoEm).toLocaleString('pt-BR')) : 'Conferência pendente'}${a.conferidoPor ? ' · ' + esc(a.conferidoPor) : ''}</small>${a.atualizacaoCadastro ? `<small>Data aplicada ao cadastro: ${esc(dateLabel(a.atualizacaoCadastro.depois))} · ${esc(a.atualizacaoCadastro.campo)}</small>` : ''}${a.obs ? `<small>${esc(a.obs)}</small>` : ''}</div><div class="v26-doc-actions"><button type="button" class="btn btn-primary" data-action="view">Ver</button><button type="button" class="btn btn-ghost" data-action="download">Baixar</button>${canEdit() ? `${!a.storageId ? '<button type="button" class="btn btn-ghost" data-action="migrate">Guardar na área privada</button>' : ''}<button type="button" class="btn btn-ghost" data-action="review">${a.conferidoEm ? 'Reabrir conferência' : 'Conferir'}</button><button type="button" class="btn btn-danger" data-action="remove">Remover</button>` : ''}</div></div>`).join('') : '<p class="v26-doc-owner-note">Nenhum documento encontrado.</p>';
    }
    el('search').oninput = renderList; el('filter').onchange = renderList;
    el('list').onclick = async event => {
      const button = event.target.closest('[data-action]'), row = button?.closest('[data-document-id]');
      if (!row) return;
      const list = records(kind,id), item = list.find(a => a.id === row.dataset.documentId);
      if (!item || !canView()) return;
      if (button.dataset.action === 'view') { try { return window.v26VisualizarDataUrl(await window.sstPrivateDocuments.dataURL(item),item.mime,item.nome); } catch(error) { return notice(error.message); } }
      if (button.dataset.action === 'download') {
        if (!canDownload()) return notice('Seu perfil permite visualizar, sem baixar documentos.');
        try { const a = document.createElement('a'); a.href = window.sstSafeDocumentURL(await window.sstPrivateDocuments.dataURL(item,'download')); a.download = item.nome; a.click(); } catch(error) { notice(error.message); } return;
      }
      if (!canEdit()) return;
      if (button.dataset.action === 'migrate') {
        button.disabled=true;
        try {
          const original=window.sstSafeDocumentURL(item.dataUrl),encoded=original.split(',')[1];
          const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
          const file=new File([bytes],item.nome,{type:item.mime});
          const stored=await window.sstPrivateDocuments.upload(kind,id,file);
          const copied=await window.sstPrivateDocuments.dataURL(stored);
          if(copied.split(',')[1]!==encoded)throw new Error('Cópia não confirmada. O anexo original foi mantido.');
          const migrated={...item,...stored};delete migrated.dataUrl;
          await save(kind,id,list.map(a=>a.id===item.id?migrated:a),null,'Anexo legado copiado para armazenamento privado; conteúdo verificado: '+item.nome);
          notice('Arquivo guardado na área privada, com conteúdo verificado.');renderList();
        }catch(error){notice(error.message);}finally{button.disabled=false;}
        return;
      }
      if (button.dataset.action === 'remove') {
        if (!confirm('Remover este documento anexado? Datas já aplicadas ao cadastro não serão desfeitas.')) return;
        button.disabled = true;
        try { await save(kind,id,list.filter(a => a.id !== item.id)); registrarHistorico(kind,id,'Documento removido: ' + item.tipo + ' — ' + item.nome); renderList(); }
        catch(error) { notice(error.message); } finally { button.disabled = false; }
        return;
      }
      if (!item.conferidoEm) {
        try { window.v26VisualizarDataUrl(await window.sstPrivateDocuments.dataURL(item),item.mime,item.nome); } catch(error) { notice(error.message); return; }
        const preview = Array.from(document.querySelectorAll('.v26-doc-preview')).pop();
        if (!preview) return;
        const form = document.createElement('form');
        form.style.cssText = 'padding:12px 16px;border-top:1px solid #ddd;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
        const canApply = kind === 'terceiro' && ['ASO','Integração','Certificado NR'].includes(item.tipo);
        const trainings = typeof getAllTreinamentos === 'function' ? getAllTreinamentos().filter(t => t.ativo !== false) : [];
        form.innerHTML = `<label style="flex:1;min-width:180px">Responsável pela conferência<input readonly required maxlength="254" name="responsavel" value="${esc(window.tssUsuarioAtual?.().email || '')}" style="display:block;width:100%"></label>
          <label style="min-width:180px">Validade conferida no original<input type="date" name="validade" value="${esc(item.validade || '')}" style="display:block;width:100%"></label>
          ${canApply ? `<div style="width:100%;padding:12px;background:#eff6ff;border-radius:10px">
            <label><input type="checkbox" name="aplicar"> Atualizar o cadastro a partir deste documento</label>
            <div data-apply-fields hidden style="margin-top:12px">
              ${item.tipo === 'Certificado NR' ? `<label>Treinamento correspondente<select name="treinamentoId" style="display:block;width:100%"><option value="">Selecione o treinamento</option>${trainings.map(t => `<option value="${esc(t.id)}">${esc(t.nome)}</option>`).join('')}</select></label><label style="display:block;margin-top:8px">Data de realização do treinamento<input type="date" name="dataRealizacao" value="${esc(item.dataRealizacao || '')}" max="${today()}" style="display:block;width:100%"></label><small>A validade do treinamento seguirá o prazo já configurado no cadastro. A data de vencimento não substitui a data de realização.</small>` : ''}
              <p data-update-preview style="margin:8px 0;font-size:13px;white-space:pre-line"></p>
              <label><input type="checkbox" name="identidade"> Conferi que o documento pertence a este terceiro e que os dados estão corretos.</label>
            </div></div>` : '<small style="width:100%">Este tipo será conferido sem alterar datas do cadastro.</small>'}
          <button type="submit" class="btn btn-primary">Confirmar conferência</button><small style="width:100%">A atualização de uma data pode alterar a situação de acesso. As demais pendências continuam sendo verificadas.</small>`;
        preview.appendChild(form);
        const input = name => form.querySelector('[name="' + name + '"]');
        const selection = () => ({validade:input('validade').value,treinamentoId:input('treinamentoId')?.value || '',dataRealizacao:input('dataRealizacao')?.value || ''});
        const person = () => typeof getAll === 'function' ? getAll().find(t => t.id === id) : null;
        function showUpdatePreview() {
          if (!canApply) return;
          form.querySelector('[data-apply-fields]').hidden = !input('aplicar').checked;
          if (!input('aplicar').checked) return;
          try {
            const plan = buildUpdate(person(),item,selection(),trainings);
            form.querySelector('[data-update-preview]').textContent = `${plan.label}\nAtual: ${dateLabel(plan.before)} → Nova: ${dateLabel(plan.after)}${plan.after < today() && item.tipo !== 'Certificado NR' ? '\nA data está vencida; o documento continuará gerando pendência.' : ''}`;
          } catch(error) { form.querySelector('[data-update-preview]').textContent = error.message; }
        }
        form.onchange = showUpdatePreview;
        form.onsubmit = async event => {
          event.preventDefault();
          if (!canEdit()) return notice('Seu perfil não permite alterar documentos.');
          const reviewer = input('responsavel').value.trim();
          if (!reviewer) return;
          const current = records(kind,id), documentItem = current.find(a => a.id === item.id);
          if (!documentItem) return notice('Documento não encontrado.');
          let update = null;
          if (canApply && input('aplicar').checked) {
            if (!input('identidade').checked) return notice('Confirme a identidade do terceiro e os dados do documento.');
            try { update = buildUpdate(person(),documentItem,selection(),trainings); }
            catch(error) { return notice(error.message); }
            if (!confirm(`${update.label}\nAtual: ${dateLabel(update.before)}\nNova: ${dateLabel(update.after)}\n\nAplicar esta alteração e recalcular as pendências?`)) return;
          }
          documentItem.validade = input('validade').value;
          if (input('dataRealizacao')) documentItem.dataRealizacao = input('dataRealizacao').value;
          documentItem.conferidoEm = new Date().toISOString(); documentItem.conferidoPor = reviewer;
          if (update) documentItem.atualizacaoCadastro = {campo:update.field,antes:update.before,depois:update.after,data:documentItem.conferidoEm,responsavel:reviewer};
          const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
          try {
            const historyText = 'Documento conferido: ' + item.tipo + ' — usuário autenticado: ' + reviewer + (update ? ` | ${update.label}: ${dateLabel(update.before)} → ${dateLabel(update.after)} | Anexo ${item.id}` : ' | Sem alteração de datas');
            await save(kind,id,current,update,historyText);
            preview.closest('.v26-doc-preview-overlay').remove();
            if (update) {
              ['renderDashboard','renderLista','renderPendencias','renderCentralPendencias','renderPortariaExpress'].forEach(name => { try { if (typeof window[name] === 'function') window[name](); } catch(error) { console.warn(name,error); } });
              window.abrirAnalise(id);
              notice('Documento conferido, cadastro atualizado e pendências recalculadas.');
            } else renderList();
          }
          catch(error) { notice(error.message); } finally { submit.disabled = false; }
        };
        return;
      } else {
        if (!confirm('Reabrir a conferência deste documento? Datas já aplicadas ao cadastro não serão desfeitas.')) return;
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
        draft = {file,text:result.text,method:result.method,dataRealizacao:suggestion.dataRealizacao,nrNumero:suggestion.nrNumero};
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
        const stored = await window.sstPrivateDocuments.upload(kind,id,file);
        if (active?.generation !== generation) return;
        list.unshift({id:uid(),donoTipo:kind,donoId:id,tipo,validade:el('expiry').value,obs:el('note').value.trim(),nome:file.name,tamanho:file.size,...stored,leituraMetodo:draft?.file === file ? draft.method : '',dataRealizacao:draft?.file === file ? draft.dataRealizacao : '',nrNumero:draft?.file === file ? draft.nrNumero : ''});
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
