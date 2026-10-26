/* Ajustes de coerência mobile para homologação 0.2.x. */
(function(){
  'use strict';

  function textoData(iso){
    if(!iso)return 'Não informada';
    if(typeof fmtData==='function')return fmtData(iso);
    const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m?`${m[3]}/${m[2]}/${m[1]}`:String(iso);
  }

  function obterEmpresa(id){
    try{return typeof getEmpresaById==='function'?getEmpresaById(id):null;}catch{return null;}
  }

  function ensureCentralCTA(){
    const dashboard=document.getElementById('page-dashboard');
    if(!dashboard||document.getElementById('sst-central-pendencias-cta'))return;
    const button=document.createElement('button');
    button.id='sst-central-pendencias-cta';
    button.type='button';
    button.className='btn btn-primary';
    button.style.cssText='width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 18px;margin:0 0 16px;border-radius:16px;text-align:left;';
    button.onclick=()=>typeof showPage==='function'&&showPage('pendencias');
    const left=document.createElement('span');
    const title=document.createElement('strong');title.textContent='Central de Pendências';title.style.cssText='display:block;font-size:17px;';
    const sub=document.createElement('small');sub.textContent='Bloqueios, ASO, integração, documentos e cadastros incompletos';sub.style.cssText='display:block;opacity:.88;margin-top:4px;';
    left.append(title,sub);
    const count=document.createElement('strong');count.id='sst-central-pendencias-cta-count';count.textContent='0';count.style.cssText='font-size:22px;min-width:32px;text-align:center;';
    button.append(left,count);
    const actions=dashboard.querySelector('.page-actions');
    if(actions)actions.insertAdjacentElement('afterend',button);else dashboard.prepend(button);

    const source=document.getElementById('dash-pendencias');
    if(source){
      const sync=()=>{count.textContent=source.textContent||'0';};sync();
      new MutationObserver(sync).observe(source,{childList:true,subtree:true,characterData:true});
    }
  }

  function ensureLocalDataHelp(){
    const main=document.querySelector('main');
    if(!main||document.getElementById('sst-local-data-help'))return;
    const box=document.createElement('section');
    box.id='sst-local-data-help';
    box.className='card';
    box.style.cssText='padding:14px 16px;margin:10px 0 16px;border-left:4px solid #2563eb;';
    const title=document.createElement('strong');title.textContent='Dados salvos neste aparelho';
    const text=document.createElement('p');
    text.style.cssText='margin:6px 0 0;font-size:13px;line-height:1.45;color:var(--muted);';
    text.textContent='É a cópia local e cifrada do SST neste celular. Ela permite consultar e trabalhar mesmo sem internet. Quando outro aparelho autorizado for vinculado e a sincronização estiver ligada, as alterações confirmadas poderão ser sincronizadas entre os aparelhos.';
    box.append(title,text);
    const toolbar=document.getElementById('sst-device-toolbar');
    if(toolbar)toolbar.insertAdjacentElement('afterend',box);else main.prepend(box);
  }

  function ensureEmpresaValidityPreview(selectId,pageId,prefix){
    const select=document.getElementById(selectId),page=document.getElementById(pageId);
    if(!select||!page)return;
    let box=document.getElementById(prefix+'-empresa-validade');
    if(!box){
      const cards=[...page.querySelectorAll('.card')];
      const docCard=cards.find(card=>card.querySelector('.card-title')?.textContent.trim()==='Documentação');
      if(!docCard)return;
      box=document.createElement('div');box.id=prefix+'-empresa-validade';box.className='full';
      box.style.cssText='margin-top:12px;padding:12px 14px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;';
      const title=document.createElement('strong');title.textContent='Validades herdadas da empresa';title.style.cssText='display:block;margin-bottom:8px;color:#1d4ed8;';
      const dp=document.createElement('div');dp.id=prefix+'-empresa-dp';
      const sesmt=document.createElement('div');sesmt.id=prefix+'-empresa-sesmt';sesmt.style.marginTop='5px';
      const note=document.createElement('small');note.textContent='Essas datas vêm automaticamente do cadastro da empresa e não precisam ser digitadas novamente no terceiro.';note.style.cssText='display:block;margin-top:8px;color:var(--muted);';
      box.append(title,dp,sesmt,note);
      const grid=docCard.querySelector('.form-grid')||docCard;
      grid.append(box);
    }
    const update=()=>{
      const empresa=obterEmpresa(select.value);
      const dp=document.getElementById(prefix+'-empresa-dp');
      const sesmt=document.getElementById(prefix+'-empresa-sesmt');
      if(!dp||!sesmt)return;
      if(!empresa){dp.textContent='DP da empresa: selecione uma empresa';sesmt.textContent='SESMT da empresa: selecione uma empresa';box.style.display='block';return;}
      dp.textContent='DP da empresa: '+textoData(empresa.docDPValidade);
      sesmt.textContent='SESMT da empresa: '+textoData(empresa.docSESMTValidade);
      box.style.display='block';
    };
    if(!select.dataset.sstEmpresaValidityBound){select.addEventListener('change',update);select.dataset.sstEmpresaValidityBound='1';}
    update();
  }

  function apply(){
    ensureCentralCTA();
    ensureLocalDataHelp();
    ensureEmpresaValidityPreview('f-empresa','page-cadastro','sst-cadastro');
    ensureEmpresaValidityPreview('e-empresa','page-edicao','sst-edicao');
  }

  const observer=new MutationObserver(()=>apply());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{apply();observer.observe(document.body,{childList:true,subtree:true});});
  else{apply();observer.observe(document.body,{childList:true,subtree:true});}
})();
