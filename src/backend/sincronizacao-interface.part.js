  function renderEverythingSafe(){
    const funcs = [
      'atualizarStats','renderDashboard','renderDashboardV11','renderLista','renderEmpresas','renderTreinamentos',
      'renderRankingEmpresas','renderPendencias','renderPortariaExpress','renderCentralPendencias'
    ];
    funcs.forEach(name => { try { if (typeof window[name] === 'function') window[name](); } catch(e){} });
    try { if (typeof popularSelectEmpresas === 'function') popularSelectEmpresas('f-empresa'); } catch(e){}
    try { if (typeof popularSelectEmpresas === 'function') popularSelectEmpresas('e-empresa'); } catch(e){}
  }

  function updateBancoBadge(status){
    let el = document.getElementById('tss-banco-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tss-banco-status';
      el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;padding:8px 10px;border-radius:12px;font:600 12px system-ui;background:#0f172a;color:#fff;box-shadow:0 8px 22px rgba(0,0,0,.22);opacity:.92;';
      document.body.appendChild(el);
    }
    if (status === 'online') {
      el.textContent = 'Banco online';
      el.style.background = '#15803d';
      setTimeout(() => { if (el && el.textContent === 'Banco online') el.style.display = 'none'; }, 2500);
    } else if (status === 'loading') {
      el.style.display = 'block';
      el.textContent = 'Sincronizando banco...';
      el.style.background = '#b45309';
    } else {
      el.style.display = 'block';
      el.textContent = 'Banco sem confirmação online';
      el.style.background = '#991b1b';
    }
  }

  function wrapLocalSavers(){
    const wrap = (name) => {
      const original = window[name];
      if (typeof original !== 'function' || original.__tssWrappedV28) return;
      const wrapped = function(){
        if (name !== 'registrarHistorico' && !can('cadastrar')) {
          if (typeof toast === 'function') toast('⚠ Seu perfil não permite alterar cadastros.');
          return false;
        }
        const result = original.apply(this, arguments);
        if (!can('cadastrar')) return result;
        markLocalChanged();
        scheduleRemoteSync();
        return result;
      };
      wrapped.__tssWrappedV28 = true;
      window[name] = wrapped;
      // Global function bindings already follow their window property.
    };

    [
      'saveAll','saveAllEmpresas','saveAllTreinamentos',
      'setAnexosTerceiro','setArquivosTerceiroV16','setArquivosEmpresaV26',
      'registrarHistorico','importarPlanilhaExcel','importarBackupJSON'
    ].forEach(wrap);
  }

