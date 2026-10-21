  window.abrirExportacaoRelatorio = function(){
    if (membership?.role !== 'admin') return window.gerarRelatorioExecutivo();
    window.sstAbrirRelatorio({request:body=>authorizedFetch(SUPABASE_URL+'/rest/v1/rpc/sst_audit_report',{method:'POST',body:JSON.stringify(body)})});
  };
  function installAuditButton(){
    if(document.getElementById('tss-audit-open')) return;
    const button=document.createElement('button'); button.id='tss-audit-open'; button.className='btn btn-ghost'; button.textContent='Auditoria';
    document.getElementById('tss-users-open').after(button);
    button.onclick=()=>{
      const overlay=document.createElement('div'); overlay.className='sst-sensitive-dialog';
      overlay.style.cssText='position:fixed;inset:0;z-index:100001;background:#0008;padding:24px;overflow:auto';
      overlay.innerHTML='<section style="background:white;padding:20px;border-radius:12px;max-width:1100px;margin:auto"><button class="btn btn-ghost" data-close>Fechar</button><h2>Auditoria de alterações</h2><p>Autor pelo login · horário do banco · motivo informado. Registros anteriores à ativação não possuem esta auditoria.</p><label>Pesquisar nos registros carregados <input data-search placeholder="Nome, e-mail ou motivo"></label><div data-rows></div><button class="btn btn-ghost" data-more>Carregar mais</button></section>';
      document.body.appendChild(overlay); overlay.querySelector('[data-close]').onclick=()=>overlay.remove();
      let rows=[],offset=0;
      function render(){
        const term=overlay.querySelector('[data-search]').value.toLocaleLowerCase('pt-BR');
        overlay.querySelector('[data-rows]').innerHTML=rows.filter(r=>JSON.stringify(r).toLocaleLowerCase('pt-BR').includes(term)).map(r=>`<article style="padding:12px 0;border-bottom:1px solid #ddd"><strong>${esc(r.action)} · ${esc(r.entity_type)} · ${esc(r.entity_id)}</strong><p>${esc(r.actor_email)} · ${esc(new Date(r.occurred_at).toLocaleString('pt-BR'))}</p><p><b>Motivo:</b> ${esc(r.reason)}</p><details><summary>Valores anteriores e novos</summary><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px"><div><b>Antes</b><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(r.before_data,null,2))}</pre></div><div><b>Depois</b><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(r.after_data,null,2))}</pre></div></div></details></article>`).join('') || '<p>Nenhum registro encontrado.</p>';
      }
      async function load(){
        const more=overlay.querySelector('[data-more]'); more.disabled=true;
        try {
          const res=await authorizedFetch(SUPABASE_URL+'/rest/v1/sst_audit_log?select=*&order=occurred_at.desc,id.desc&limit=50&offset='+offset);
          if(!res.ok) throw new Error('Falha ao carregar auditoria.');
          const page=await res.json(); rows.push(...page); offset+=page.length; more.hidden=page.length<50; render();
        } catch(e) { overlay.querySelector('[data-rows]').textContent=e.message; } finally {more.disabled=false;}
      }
      overlay.querySelector('[data-search]').oninput=render; overlay.querySelector('[data-more]').onclick=load; load();
    };
  }
