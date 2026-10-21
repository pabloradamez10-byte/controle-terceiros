  let guardsInstalled = false;
  function installPermissionGuards(){
    if (guardsInstalled) return;
    guardsInstalled = true;
    const originalShowPage = window.showPage;
    window.showPage = function(page){
      if (!can('cadastrar') && ['cadastro','dados'].includes(page)) {
        toast('⚠ Seu perfil permite apenas consultar e/ou liberar por exceção.');
        return;
      }
      return originalShowPage.apply(this, arguments);
    };
    showPage = window.showPage;
    for (const name of ['salvarTerceiro','salvarEdicao','salvarEmpresa','salvarTreinamento','excluir','excluirEmpresa','importarPlanilhaExcel','abrirModalNovaEmpresa','abrirModalEditarEmpresa','abrirModalNovoTreinamento','abrirModalEditarTreinamento']) {
      const original = window[name];
      if (typeof original !== 'function') continue;
      window[name] = function(){
        if (!can('cadastrar')) { toast('⚠ Sem permissão para cadastrar.'); return; }
        if (['excluir','excluirEmpresa'].includes(name) && membership?.role !== 'admin') { toast('⚠ Exclusão exige ADM.'); return; }
        return original.apply(this,arguments);
      };
      // The global binding is updated through window[name].
    }
    const originalException = window.salvarLiberacaoExcecao;
    window.salvarLiberacaoExcecao = function(){
      if (!can('liberar')) { toast('⚠ Sem permissão para liberar por exceção.'); return; }
      return originalException.apply(this,arguments);
    };
    salvarLiberacaoExcecao = window.salvarLiberacaoExcecao;
    const originalBox = window.renderExcecaoBox;
    window.renderExcecaoBox = function(id){
      if (!can('liberar')) return '<p class="muted-note">Seu perfil pode consultar a situação, sem liberar por exceção.</p>';
      return originalBox(id);
    };
    renderExcecaoBox = window.renderExcecaoBox;
  }
