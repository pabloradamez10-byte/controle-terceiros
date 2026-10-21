/* Historical eligibility from immutable database source versions. No gate-entry inference. */
(function(root){
  'use strict';
  const zone='America/Sao_Paulo';
  const day = value => new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const nextDay = value => new Date(Date.parse(value+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const valid = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value.slice(0,4)>='2000' && !isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const fmt = value => valid(value) ? value.split('-').reverse().join('/') : 'Data não informada';
  const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateTime = value => new Date(value).toLocaleString('pt-BR',{timeZone:zone});
  const norm = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function evaluate(person,state,exceptions,onDay){
    const company=(state.empresas||[]).find(e=>e.id===person.empresaId), reasons=[],warnings=[];
    function check(value,missing,expired,warning,blockMissing=false){
      if(!valid(value)) (blockMissing?reasons:warnings).push(missing);
      else if(value<onDay) reasons.push(expired+fmt(value));
      else {
        const days=Math.round((Date.parse(value+'T00:00:00Z')-Date.parse(onDay+'T00:00:00Z'))/86400000);
        if(days<=30) warnings.push(warning+'vence em '+fmt(value)+' ('+days+' dia(s))');
      }
    }
    if(!company) warnings.push('Empresa não vinculada ao cadastro');
    else {
      check(company.contratoFim,'Fim da prestação de serviço sem data informada','Fim da prestação de serviço vencido em ','Fim da prestação de serviço ');
      check(company.docDPValidade,'Documentos DP sem data informada','Documentos DP vencidos em ','Documentos DP ');
    }
    check(person.aso,'ASO sem data informada','ASO vencido em ','ASO ',true);
    check(person.integ,'Integração sem data informada','Integração vencida em ','Integração ');
    if(company) check(company.docSESMTValidade,'Documentos SESMT sem data informada','Documentos SESMT vencidos em ','Documentos SESMT ');
    const pending=!reasons.length && warnings.some(x=>x==='Integração sem data informada'||x==='Documentos SESMT sem data informada');
    const ex=exceptions?.[person.id];
    const active=ex?.ativo && valid(ex.dataLiberacao) && valid(ex.dataAte) && ex.dataLiberacao<=onDay && ex.dataAte>=onDay && Array.isArray(ex.pendenciasAutorizadas);
    const covered=active && [...reasons,...warnings].every(x=>ex.pendenciasAutorizadas.includes(x));
    const exception=!!(covered && valid(person.aso) && person.aso>=onDay && (reasons.length||pending));
    return {status:exception?'LIBERADO POR EXCEÇÃO':reasons.length?'BLOQUEADO':pending?'PENDENTE':'LIBERADO',reasons,warnings,exception,authorization:exception?ex:null,company};
  }
  function intervals(report){
    const snapshots=[...(report.snapshots||[])].sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at)||a.id-b.id);
    const from=Date.parse(report.requested_from),until=Date.parse(report.effective_to_exclusive),rows=[];
    for(let i=0;i<snapshots.length;i++){
      const s=snapshots[i];
      if(s.rule_version!=='sst-access-v1') throw new Error('Versão de regra não reconhecida: '+s.rule_version);
      let start=Math.max(from,Date.parse(s.captured_at));
      const end=Math.min(until,i+1<snapshots.length?Date.parse(snapshots[i+1].captured_at):until);
      while(start<end){
        const d=day(start),stop=Math.min(end,Date.parse(nextDay(d)+'T00:00:00-03:00'));
        for(const person of s.state.terceiros||[]){
          const result=evaluate(person,s.state,s.exceptions,d);
          rows.push({from:new Date(start).toISOString(),to_exclusive:new Date(stop).toISOString(),day:d,person_id:person.id,name:person.nome||'',cpf:person.cpf||'',company_id:person.empresaId||'',company:result.company?.nome||result.company?.razaoSocial||person.empresa||'Sem empresa',status:result.status,reasons:result.reasons,warnings:result.warnings,authorization:result.authorization,evidence:{aso:person.aso||'',integracao:person.integ||'',fim_prestacao:result.company?.contratoFim||'',documentos_dp:result.company?.docDPValidade||'',documentos_sesmt:result.company?.docSESMTValidade||''},snapshot_id:s.id,source_time:s.captured_at,source_actor:s.actor_email||'Sistema — marco inicial',source_reason:s.reason,calculation_cause:start===Date.parse(s.captured_at)?'Versão de dados registrada':start===from?'Situação no início do período':'Reavaliação pela passagem da data; sem ação humana',rule:s.rule_version,physical_entry:'Não registrada neste módulo'});
          if(rows.length>100000) throw new Error('Relatório muito extenso. Escolha menos dias ou emita períodos separados. Nenhuma linha foi omitida.');
        }
        start=stop;
      }
    }
    return rows;
  }
  function csv(rows){
    const q=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'"+'$&').replace(/"/g,'""')+'"';
    const header=['Início','Fim exclusivo','Terceiro ID','Nome','CPF','Empresa','Situação calculada','Motivos de bloqueio','Avisos','ASO validade','Integração validade','Prestação fim','Documentos DP validade','Documentos SESMT validade','Autorização','Aprovador informado','Vigência início','Vigência fim','Versão da origem','Origem registrada por','Motivo da versão','Origem do cálculo','Entrada física'];
    return '\ufeff'+[header,...rows.map(r=>[dateTime(r.from),dateTime(r.to_exclusive),r.person_id,r.name,r.cpf,r.company,r.status,r.reasons.join(' | '),r.warnings.join(' | '),r.evidence?.aso,r.evidence?.integracao,r.evidence?.fim_prestacao,r.evidence?.documentos_dp,r.evidence?.documentos_sesmt,r.authorization?.numeroAutorizacao,r.authorization?.aprovador,r.authorization?.dataLiberacao,r.authorization?.dataAte,r.snapshot_id,r.source_actor,r.source_reason,r.calculation_cause,r.physical_entry])].map(r=>r.map(q).join(';')).join('\r\n');
  }
  function eventLabel(e){
    if(e.entity_type==='sst_excecoes'){
      const a=e.after_data?.dados,b=e.before_data?.dados;
      return a?.ativo?'AUTORIZAÇÃO POR EXCEÇÃO REGISTRADA':b?.ativo?'AUTORIZAÇÃO CANCELADA':'EXCEÇÃO ALTERADA';
    }
    return e.action+' · '+e.entity_type;
  }
  root.sstRelatorioCore={day,nextDay,valid,evaluate,intervals,csv,eventLabel};
  root.sstAbrirRelatorio = function({request}){
    const overlay=document.createElement('div'); overlay.className='sst-report-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:#0f172acc;z-index:100002;padding:20px;overflow:auto';
    overlay.innerHTML=`<section style="background:white;border-radius:12px;max-width:1450px;margin:auto;padding:20px;color:#172033"><button data-close class="btn btn-ghost">Fechar</button><h2>Relatório auditável de acesso</h2><p>Histórico da situação calculada e das autorizações. <b>Autorização de acesso não comprova entrada física.</b> Horários de Brasília; o fim de cada intervalo é exclusivo.</p><form data-form style="display:flex;gap:12px;flex-wrap:wrap;align-items:end"><label>Data inicial<input data-from type="date" required></label><label>Data final (inclusive)<input data-to type="date" required></label><button class="btn btn-primary" data-generate>Gerar relatório</button></form><p data-message role="status"></p><div data-results hidden><div style="display:flex;gap:12px;flex-wrap:wrap"><label>Terceiro / CPF<input data-person placeholder="Nome ou CPF"></label><label>Empresa<select data-company><option value="">Todas</option></select></label><label>Situação<select data-status><option value="">Todas</option><option>BLOQUEADO</option><option>PENDENTE</option><option>LIBERADO</option><option>LIBERADO POR EXCEÇÃO</option></select></label><label>Autor ou motivo do evento<input data-event placeholder="E-mail ou motivo"></label></div><p data-summary></p><p data-meta style="font-size:12px;overflow-wrap:anywhere"></p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost" data-print>Imprimir / salvar PDF</button><button class="btn btn-ghost" data-csv>CSV das situações</button><button class="btn btn-ghost" data-json>Pacote completo JSON</button></div><h3>Situação por intervalo</h3><div data-table style="overflow:auto"></div><button data-more class="btn btn-ghost">Mostrar mais intervalos</button><h3>Eventos comprovados no período</h3><p>Inclui autor do login, motivo, valores anteriores e novos e IDs do banco. O aprovador informado na autorização é exibido separadamente do usuário que a registrou.</p><div data-events></div><button data-more-events class="btn btn-ghost">Mostrar mais eventos</button></div></section>`;
    document.body.appendChild(overlay);
    const el=selector=>overlay.querySelector('[data-'+selector+']');
    el('from').value=day(Date.now());el('to').value=day(Date.now());el('close').onclick=()=>overlay.remove();
    let report,allRows=[],visible=[],events=[],count=100,eventCount=50,hash='',reportId='',query='';
    const matches=(r,term)=>!term || (typeof root.correspondeBuscaSST==='function'?root.correspondeBuscaSST(term,[r.name],[r.cpf]):norm(r.name+' '+r.cpf).includes(norm(term)));
    function selected(){
      const person=el('person').value.trim(),company=el('company').value,status=el('status').value;
      visible=allRows.filter(r=>matches(r,person)&&(!company||r.company_id===company)&&(!status||r.status===status));
      const ids=new Set(visible.map(r=>r.person_id)),companyIds=new Set(visible.map(r=>r.company_id));
      events=(report.events||[]).filter(e=>{
        if(!norm(JSON.stringify(e)).includes(norm(el('event').value)))return false;
        if(!person&&!company&&!status)return true;
        return ids.has(e.entity_id)||companyIds.has(e.entity_id);
      });
    }
    function rowsHTML(rows){return `<table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr>${['Intervalo','Terceiro / empresa','Situação','Motivos / avisos','Dados usados no cálculo','Exceção','Origem'].map(x=>'<th style="padding:8px;border:1px solid #ddd;text-align:left">'+x+'</th>').join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${[dateTime(r.from)+' → '+dateTime(r.to_exclusive),r.name+' / '+r.company,r.status,[...r.reasons,...r.warnings].join(' | ')||'Sem pendências',Object.entries(r.evidence||{}).map(([k,v])=>k+': '+fmt(v)).join(' | '),r.authorization?`${r.authorization.numeroAutorizacao||'Sem número'} · aprovador informado: ${r.authorization.aprovador||'Não informado'} · ${fmt(r.authorization.dataLiberacao)} a ${fmt(r.authorization.dataAte)}`:'Sem liberação por exceção aplicada',`${r.calculation_cause} · Versão #${r.snapshot_id} registrada por ${r.source_actor} · motivo da versão: ${r.source_reason}`].map(x=>'<td style="padding:8px;border:1px solid #ddd;vertical-align:top">'+esc(x)+'</td>').join('')}</tr>`).join('')}</tbody></table>`;}
    function eventsHTML(list,print=false){return list.map(e=>`<article style="padding:10px 0;border-bottom:1px solid #ddd;break-inside:avoid"><b>#${esc(e.id)} · ${esc(eventLabel(e))}</b><p>${esc(dateTime(e.occurred_at))} · ${esc(e.actor_email)} · cadastro ${esc(e.entity_id)}</p><p>Motivo: ${esc(e.reason)}</p><details ${print?'open':''}><summary>Antes e depois</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify({antes:e.before_data,depois:e.after_data},null,2))}</pre></details></article>`).join('')||'<p>Nenhum evento registrado para os filtros selecionados.</p>';}
    function filters(){return {terceiro:el('person').value,empresa_id:el('company').value,situacao:el('status').value,autor_ou_motivo:el('event').value};}
    function render(){
      selected();el('summary').textContent=`${visible.length} intervalos de situação · ${new Set(visible.map(r=>r.person_id)).size} terceiros · ${events.length} eventos. Intervalos não são contagem de entradas.`;
      el('table').innerHTML=rowsHTML(visible.slice(0,count));el('more').hidden=count>=visible.length;
      el('events').innerHTML=eventsHTML(events.slice(0,eventCount));el('more-events').hidden=eventCount>=events.length;
    }
    function download(content,type,name){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([content],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
    function filterChange(){count=100;eventCount=50;render();}
    ['person','company','status','event'].forEach(k=>el(k).oninput=filterChange);
    el('more').onclick=()=>{count+=100;render()};el('more-events').onclick=()=>{eventCount+=50;render()};
    el('form').onsubmit=async e=>{
      e.preventDefault();el('results').hidden=true;el('generate').disabled=true;el('message').textContent='Consultando registros do banco…';
      try{
        const from=el('from').value,to=el('to').value;if(!valid(from)||!valid(to)||from>to)throw new Error('Informe as datas inicial e final corretamente.');
        const res=await request({p_from:from+'T00:00:00-03:00',p_to:nextDay(to)+'T00:00:00-03:00'});
        if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.message||'Falha ao emitir relatório.');}
        report=await res.json();allRows=intervals(report);count=100;eventCount=50;
        reportId=crypto.randomUUID();hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(report))))).map(x=>x.toString(16).padStart(2,'0')).join('');
        query=`${fmt(from)} a ${fmt(to)}`;
        el('message').textContent=(!report.coverage_start||Date.parse(report.requested_from)<Date.parse(report.coverage_start)?`ATENÇÃO: situação histórica só comprovável a partir de ${report.coverage_start?dateTime(report.coverage_start):'nenhum marco disponível'}. Antes disso: SEM COMPROVAÇÃO HISTÓRICA. Eventos anteriores, se existentes, continuam listados. `:'')+'Situações calculadas com os dados preservados e regra SST v1. Entrada física: não registrada neste módulo.';
        el('meta').textContent=`Relatório ${reportId} · emitido em ${dateTime(report.generated_at)} por ${report.issued_by_email} · período ${query} · corte ${dateTime(report.effective_to_exclusive)} · SHA-256 da fonte: ${hash}`;
        const companies=new Map(allRows.map(r=>[r.company_id,r.company]));el('company').innerHTML='<option value="">Todas</option>'+[...companies].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
        el('results').hidden=false;render();
      }catch(error){el('message').textContent=error.message;}finally{el('generate').disabled=false;}
    };
    el('csv').onclick=()=>download(csv(visible),'text/csv;charset=utf-8','sst-situacoes-'+reportId+'.csv');
    el('json').onclick=()=>download(JSON.stringify({report_id:reportId,source_sha256:hash,source:report,filters:filters(),intervals:visible,events},null,2),'application/json','sst-auditoria-'+reportId+'.json');
    el('print').onclick=()=>{
      const win=window.open('','_blank');if(!win){el('message').textContent='Permita abrir a janela de impressão neste site.';return;}
      win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório SST ${esc(reportId)}</title><style>body{font:12px Arial;color:#111}pre{font-size:10px}thead{display:table-header-group}@page{size:A4 landscape;margin:12mm}th{background:#eee}h2{break-before:page}</style></head><body><h1>Relatório auditável de acesso — SST</h1><p>${esc(el('meta').textContent)}</p><p>${esc(el('message').textContent)}</p><p>Filtros: ${esc(JSON.stringify(filters()))}</p><p>${esc(el('summary').textContent)}</p><h2>Situações por intervalo</h2>${rowsHTML(visible)}<h2>Eventos e valores anteriores e novos</h2>${eventsHTML(events,true)}<p>Fonte: versões preservadas no banco e auditoria de alterações. Este relatório não comprova entrada física nem substitui registro de portaria. O hash identifica a fonte exportada; não é assinatura digital.</p></body></html>`);win.document.close();win.focus();win.print();
    };
  };
})(typeof window==='undefined'?globalThis:window);
