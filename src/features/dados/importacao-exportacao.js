  function renderDados() {
    const terceiros = getAll();
    const empresas = getAllEmpresas();
    const treinamentos = getAllTreinamentos();
    const pendencias = typeof coletarPendencias === 'function' ? coletarPendencias() : [];
    const elT = document.getElementById('dados-total-terceiros');
    const elE = document.getElementById('dados-total-empresas');
    const elTr = document.getElementById('dados-total-treinamentos');
    const elP = document.getElementById('dados-total-pendencias');
    if (elT) elT.textContent = terceiros.length;
    if (elE) elE.textContent = empresas.length;
    if (elTr) elTr.textContent = treinamentos.length;
    if (elP) elP.textContent = pendencias.length;
  }

  function baixarArquivo(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportarBackupJSON() {
    const backup = {
      app: 'Controle de Terceiros',
      versao: 'V8',
      exportadoEm: new Date().toISOString(),
      terceiros: getAll(),
      empresas: getAllEmpresas(),
      treinamentos: getAllTreinamentos()
    };
    baixarArquivo('backup-controle-terceiros.json', JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
    toast('✓ Backup gerado.');
  }

  function importarBackupJSON(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.terceiros) || !Array.isArray(data.empresas) || !Array.isArray(data.treinamentos)) {
          throw new Error('Arquivo inválido para este sistema.');
        }
        if (!confirm('Esse backup vai substituir os cadastros atuais. Deseja continuar?')) return;
        saveAll(data.terceiros);
        saveAllEmpresas(data.empresas);
        saveAllTreinamentos(data.treinamentos);
        popularSelectEmpresas('f-empresa');
        popularSelectEmpresas('e-empresa');
        renderDashboard();
        renderDados();
        document.getElementById('import-log').textContent = `Backup restaurado com sucesso.\nTerceiros: ${data.terceiros.length}\nEmpresas: ${data.empresas.length}\nTreinamentos: ${data.treinamentos.length}`;
        toast('✓ Backup restaurado.');
      } catch (err) {
        toast('⚠ Erro ao importar backup.');
        document.getElementById('import-log').textContent = 'Erro ao importar backup: ' + err.message;
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  function csvEscape(v) {
    const s = (v ?? '').toString().replace(/"/g, '""');
    return `"${s}"`;
  }

  function exportarCSVTerceiros() {
    const header = ['Nome','CPF','Empresa','Função','ASO','Integração','Status','Motivos','Observação'];
    const rows = getAll().map(t => {
      const st = getStatus(t);
      return [t.nome, t.cpf, t.empresa, t.funcao, fmtData(t.aso), fmtData(t.integ), st.ok ? 'LIBERADO' : 'BLOQUEADO', st.motivos.join(' | '), t.obs || ''];
    });
    const csv = [header, ...rows].map(r => r.map(csvEscape).join(';')).join('\n');
    baixarArquivo('terceiros-controle.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  }

  function exportarCSVEmpresas() {
    const header = ['Razão Social','Fantasia','CNPJ','Responsável','Telefone','E-mail','Contrato Início','Contrato Fim','Treinamentos Obrigatórios'];
    const rows = getAllEmpresas().map(e => {
      const nomes = (e.treinamentosObrigatorios || []).map(id => getTreinamentoById(id)?.nome).filter(Boolean).join(' | ');
      return [e.razao, e.fantasia || '', e.cnpj, e.resp, e.tel || '', e.email || '', fmtData(e.contratoInicio), fmtData(e.contratoFim), nomes];
    });
    const csv = [header, ...rows].map(r => r.map(csvEscape).join(';')).join('\n');
    baixarArquivo('empresas-controle.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  }

  function baixarModeloCSV() {
    const csv = [
      ['Empresa','CNPJ','Nome do Profissional','CPF','Função','ASO','Integração','Fim Prestação Serviço'],
      ['Landim','00.000.000/0001-00','Jonilson Guimarães','000.000.000-00','Soldador','31/12/2026','31/12/2026','31/12/2026']
    ].map(r => r.map(csvEscape).join(';')).join('\n');
    baixarArquivo('modelo-importacao-controle-terceiros.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  }

  function normalizarTexto(v) {
    return (v ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function localizarColuna(headers, termos) {
    const norm = headers.map(h => normalizarTexto(h));
    return norm.findIndex(h => termos.some(t => h.includes(normalizarTexto(t))));
  }

  function localizarLinhaCabecalho(rows) {
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const txt = rows[i].map(normalizarTexto).join(' | ');
      if ((txt.includes('empresa') || txt.includes('cnpj')) && (txt.includes('profissional') || txt.includes('nome'))) return i;
    }
    return 0;
  }

  function valorCelula(row, idx) {
    if (idx < 0) return '';
    return row[idx] ?? '';
  }

  function extrairCNPJ(texto) {
    const s = (texto || '').toString();
    const m = s.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    return m ? maskCNPJ(m[0]) : '';
  }

  function limparNomeEmpresa(texto) {
    return (texto || '').toString().replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, '').replace(/[-–—]+$/g,'').trim();
  }

  function dataParaISO(v) {
    if (!v && v !== 0) return '';
    if (typeof v === 'number') {
      // Excel serial date
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(epoch.getTime() + v * 86400000);
      return d.toISOString().split('T')[0];
    }
    const s = v.toString().trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    const m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = '20' + y;
      return `${y.padStart(4,'0')}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    return '';
  }

  function importarPlanilhaExcel(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') {
      toast('⚠ Biblioteca de Excel não carregou. Verifique a internet.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
        if (!rows.length) throw new Error('Planilha vazia.');

        const headerIdx = localizarLinhaCabecalho(rows);
        const headers = rows[headerIdx];
        const idxEmpresa = localizarColuna(headers, ['nome da empresa', 'empresa']);
        const idxCnpj = localizarColuna(headers, ['cnpj']);
        const idxProf = localizarColuna(headers, ['nome do profissional', 'profissional', 'nome completo', 'colaborador', 'terceiro']);
        const idxCpf = localizarColuna(headers, ['cpf']);
        const idxFuncao = localizarColuna(headers, ['funcao', 'função', 'cargo']);
        const idxAso = localizarColuna(headers, ['aso', 'documentos sesmt']);
        const idxInteg = localizarColuna(headers, ['integracao', 'integração', 'validade treinamento']);
        const idxFim = localizarColuna(headers, ['fim prestacao', 'fim prestação', 'fim contrato', 'prestacao servico']);
        const idxSituacaoAcesso = localizarColuna(headers, ['situação acesso', 'situacao acesso', 'acesso', 'status acesso']);
        const idxSituacaoDP = localizarColuna(headers, ['situação dp', 'situacao dp', 'situação gestão', 'situacao gestao', 'gestão de pessoas', 'gestao de pessoas']);
        const idxSituacaoSESMT = localizarColuna(headers, ['situação sesmt', 'situacao sesmt', 'sesmt']);

        if (idxEmpresa < 0 || idxProf < 0) {
          throw new Error('Não encontrei as colunas mínimas: Empresa e Nome do Profissional.');
        }

        let empresas = getAllEmpresas();
        let terceiros = getAll();
        let novasEmpresas = 0, novosTerceiros = 0, atualizados = 0, ignorados = 0;

        for (let r = headerIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          const empresaTextoOriginal = valorCelula(row, idxEmpresa).toString().trim();
          const profissional = valorCelula(row, idxProf).toString().trim();
          if (!empresaTextoOriginal || !profissional) { ignorados++; continue; }

          const cnpjPlanilha = idxCnpj >= 0 ? valorCelula(row, idxCnpj).toString().trim() : '';
          const cnpj = maskCNPJ((cnpjPlanilha || extrairCNPJ(empresaTextoOriginal)).replace(/\D/g,''));
          const nomeEmpresa = limparNomeEmpresa(empresaTextoOriginal) || empresaTextoOriginal;
          const fimContrato = dataParaISO(valorCelula(row, idxFim));

          let emp = empresas.find(e =>
            (cnpj && e.cnpj && e.cnpj.replace(/\D/g,'') === cnpj.replace(/\D/g,'')) ||
            normalizarTexto(e.razao) === normalizarTexto(nomeEmpresa)
          );
          if (!emp) {
            emp = { id: uid(), razao: nomeEmpresa, fantasia: '', cnpj: cnpj || '', resp: '', tel: '', email: '', contratoInicio: '', contratoFim: fimContrato || '', treinamentosObrigatorios: [] };
            empresas.push(emp);
            novasEmpresas++;
          } else if (fimContrato && !emp.contratoFim) {
            emp.contratoFim = fimContrato;
          }

          const cpf = maskCPF(valorCelula(row, idxCpf).toString());
          const funcao = valorCelula(row, idxFuncao).toString().trim();
          const aso = dataParaISO(valorCelula(row, idxAso));
          const integ = dataParaISO(valorCelula(row, idxInteg));
          const situacaoAcessoImportada = idxSituacaoAcesso >= 0 ? valorCelula(row, idxSituacaoAcesso).toString().trim() : '';
          const situacaoDPImportada = idxSituacaoDP >= 0 ? valorCelula(row, idxSituacaoDP).toString().trim() : '';
          const situacaoSESMTImportada = idxSituacaoSESMT >= 0 ? valorCelula(row, idxSituacaoSESMT).toString().trim() : '';
          const cpfLimpo = cpf.replace(/\D/g,'');

          let terc = terceiros.find(t =>
            (cpfLimpo && t.cpf && t.cpf.replace(/\D/g,'') === cpfLimpo) ||
            (normalizarTexto(t.nome) === normalizarTexto(profissional) && t.empresaId === emp.id)
          );

          if (!terc) {
            terceiros.push({
              id: uid(), nome: profissional, cpf: cpf || '', empresaId: emp.id, empresa: emp.fantasia ? `${emp.razao} (${emp.fantasia})` : emp.razao,
              funcao: funcao || '', aso: aso || '', integ: integ || '', obs: 'Importado de planilha', treinamentosRealizados: [],
              situacaoAcessoImportada, situacaoDPImportada, situacaoSESMTImportada
            });
            novosTerceiros++;
          } else {
            terc.nome = profissional || terc.nome;
            terc.cpf = cpf || terc.cpf;
            terc.empresaId = emp.id;
            terc.empresa = emp.fantasia ? `${emp.razao} (${emp.fantasia})` : emp.razao;
            terc.funcao = funcao || terc.funcao;
            terc.aso = aso || terc.aso;
            terc.integ = integ || terc.integ;
            terc.situacaoAcessoImportada = situacaoAcessoImportada || terc.situacaoAcessoImportada || '';
            terc.situacaoDPImportada = situacaoDPImportada || terc.situacaoDPImportada || '';
            terc.situacaoSESMTImportada = situacaoSESMTImportada || terc.situacaoSESMTImportada || '';
            atualizados++;
          }
        }

        saveAllEmpresas(empresas);
        saveAll(terceiros);
        popularSelectEmpresas('f-empresa');
        popularSelectEmpresas('e-empresa');
        renderDashboard();
        renderDados();

        const msg = `Importação concluída.\nArquivo: ${file.name}\nLinhas lidas: ${Math.max(rows.length - headerIdx - 1, 0)}\nEmpresas novas: ${novasEmpresas}\nTerceiros novos: ${novosTerceiros}\nTerceiros atualizados: ${atualizados}\nLinhas ignoradas: ${ignorados}\n\nA situação de acesso da planilha foi preservada como histórico. A autorização atual é calculada pelo aplicativo. Confira ASO, Integração e Fim Prestação Serviço após importar.`;
        document.getElementById('import-log').textContent = msg;
        toast('✓ Planilha importada.');
      } catch (err) {
        document.getElementById('import-log').textContent = 'Erro na importação: ' + err.message;
        toast('⚠ Erro ao importar planilha.');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }


  // ──────────────────────────────────────────────────
  //  V10.3 — Correção: status pendente x bloqueado + clique robusto nos cards
  // ──────────────────────────────────────────────────
  // Regra: data ausente/informação incompleta vira AVISO/PENDÊNCIA, não bloqueio.
  // Bloqueio vermelho fica apenas para vencido de fato.
