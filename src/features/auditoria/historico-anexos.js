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

