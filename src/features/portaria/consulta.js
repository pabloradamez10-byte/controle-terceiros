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
