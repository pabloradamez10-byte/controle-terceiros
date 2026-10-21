/* SST browser boundary: sanitized HTML, finite UI actions, volatile private state. */
(function(){
  'use strict';
  window.sstPrivateRevision=0;
  const privateKeys = new Set(['terceiros','empresas','treinamentos','historico','anexosTerceiros','anexosEmpresas','arquivosTerceirosV16','arquivosEmpresasV26','liberacoesExcecao','tss_supabase_last_sync','tss_local_last_change','tss_instance_id']);
  const memory = new Map(), storage = window.localStorage;
  const nativeGet=Storage.prototype.getItem,nativeSet=Storage.prototype.setItem,nativeRemove=Storage.prototype.removeItem;
  for(const key of privateKeys) nativeRemove.call(storage,key);
  Storage.prototype.getItem=function(key){key=String(key);return this===storage&&privateKeys.has(key)?memory.get(key)??null:nativeGet.call(this,key)};
  Storage.prototype.setItem=function(key,value){key=String(key);if(this===storage&&privateKeys.has(key)){memory.set(key,String(value));window.sstPrivateRevision++;return;}return nativeSet.call(this,key,value)};
  Storage.prototype.removeItem=function(key){key=String(key);if(this===storage&&privateKeys.has(key)){memory.delete(key);window.sstPrivateRevision++;return;}return nativeRemove.call(this,key)};
  window.sstClearPrivateData = function(){window.sstPrivateRevision++;memory.clear();for(const key of privateKeys)nativeRemove.call(storage,key);sessionStorage.removeItem('tss_auth_session');};
  window.sstPurgePrivateCaches = async function(){
    if(!window.caches)return;
    for(const key of await caches.keys())if(key.startsWith('portal-terceiros-sst-')&&key!=='portal-terceiros-sst-security-20261021-2')await caches.delete(key);
  };
  window.sstPurgePrivateCaches().catch(()=>{});
  if(!window.DOMPurify?.isSupported){window.sstSecurityReady=false;return;}
  const purifier=window.DOMPurify;
  const calls=new Set(('abrirAlertasV21 abrirAnalise abrirAnaliseTerceiro abrirEdicao abrirExportacaoRelatorio abrirListaPorStatus abrirListaV22 abrirModalEditarEmpresa abrirModalEditarTreinamento abrirModalNovaEmpresa abrirModalNovoTreinamento abrirPainelEmpresaV21 abrirTerceirosDaEmpresaV21 adicionarAnexoTerceiro adicionarArquivoEmpresaV26 adicionarArquivoTerceiroV16 alternarTreinamento baixarArquivoEmpresaV26 baixarArquivoTerceiroV16 baixarArquivoTerceiroV26 baixarModeloCSV cancelarLiberacaoExcecao carregarMaisPendencias consultarPortaria consultarPortariaPorId excluir excluirEmpresa exportarBackupJSON exportarCSVEmpresas exportarCSVTerceiros fecharModal fecharModalAnalise fecharModalEmpresa fecharModalTreinamento limparFiltroStatusDashboard limparForm renderDados salvarEdicao salvarEmpresa salvarLiberacaoExcecao salvarTerceiro salvarTreinamento showPage v24AbrirExpress v242AbrirExpress v24ConsultarExpress v26BaixarTemp visualizarArquivoEmpresaV26 visualizarArquivoTerceiroV26 removerAnexoTerceiro removerArquivoEmpresaV26 removerArquivoTerceiroV16 renderAlertasV21Atual renderEmpresas renderLista renderListaV22 renderTreinamentos importarBackupJSON importarPlanilhaExcel').split(' '));
  function parseAction(code){
    code=String(code||'').trim();if(!code)return null;
    const key=code.match(/^if\(event.key==='Enter'(\|\|event.key===' ')?\)\s*(?:\{([\s\S]*)\}|([\s\S]*))$/);
    if(key){const inner=parseAction(key[2]??key[3]);return inner?{kind:'key',space:!!key[1],action:inner}:null;}
    if(code==="this.closest('.v26-doc-preview-overlay').remove()")return {kind:'closePreview'};
    if(code==='window.print()')return {kind:'print'};
    if(code==="document.getElementById('dash-excecoes-list')?.scrollIntoView({behavior:'smooth'})")return {kind:'scrollExceptions'};
    if(code==='window.portariaAutoBusca && window.portariaAutoBusca()')return {kind:'auto',name:'portariaAutoBusca'};
    if(code==='window.v24AutoBusca && window.v24AutoBusca()')return {kind:'auto',name:'v24AutoBusca'};
    const copy=code.match(/^copiarTexto\(gerarTextoEmailTerceiro\('([a-zA-Z0-9_-]+)'\)\)$/);if(copy)return {kind:'copy',id:copy[1]};
    const filter=code.match(/^showPage\('listagem'\); setTimeout\(\(\)=>\{ const f=document.getElementById\('filtro-empresa-lista'\); if\(f\)\{ preencherFiltroEmpresas\(\); f.value='([a-zA-Z0-9_-]+)'; renderLista\(\); \} \},50\)$/);if(filter)return {kind:'company',id:filter[1]};
    const call=code.match(/^([a-zA-Z_$][\w$]*)\((.*)\)$/);if(!call||!calls.has(call[1]))return null;
    const args=[];let source=call[2].trim();
    while(source){
      const token=source.match(/^(?:'([^'\\\r\n]*)'|(event)|(\d+))(?:\s*,\s*|$)/);if(!token)return null;
      args.push(token[2]?{event:true}:token[3]?{number:Number(token[3])}:{text:token[1]});source=source.slice(token[0].length);
    }
    return {kind:'call',name:call[1],args};
  }
  function run(action,event,node){
    if(!action||typeof action!=='object')return;
    if(action.kind==='key'){if(event.key==='Enter'||(action.space&&event.key===' '))run(action.action,event,node);return;}
    if(action.kind==='call'&&calls.has(action.name)&&Array.isArray(action.args)&&action.args.length<5){
      const fn=window[action.name];if(typeof fn==='function')return fn.apply(node,action.args.map(a=>a.event?event:a.number!==undefined?Number(a.number):String(a.text??'')));return;
    }
    if(action.kind==='closePreview')node.closest('.v26-doc-preview-overlay')?.remove();
    if(action.kind==='print')window.print();
    if(action.kind==='scrollExceptions')document.getElementById('dash-excecoes-list')?.scrollIntoView({behavior:'smooth'});
    if(action.kind==='auto'&&['portariaAutoBusca','v24AutoBusca'].includes(action.name))window[action.name]?.();
    if(action.kind==='copy'&&/^[a-zA-Z0-9_-]+$/.test(action.id))window.copiarTexto(window.gerarTextoEmailTerceiro(action.id));
    if(action.kind==='company'&&/^[a-zA-Z0-9_-]+$/.test(action.id)){window.showPage('listagem');setTimeout(()=>{const f=document.getElementById('filtro-empresa-lista');if(f){window.preencherFiltroEmpresas();f.value=action.id;window.renderLista();}},50);}
  }
  function convert(node,name,value){
    const type=name.slice(2).toLowerCase();if(!['click','input','change','keydown','submit'].includes(type))return;
    const action=parseAction(value);if(action)node.setAttribute('data-sst-'+type,JSON.stringify(action));
  }
  purifier.addHook('uponSanitizeAttribute',(node,data)=>{
    if(/^on/i.test(data.attrName)){convert(node,data.attrName,data.attrValue);data.keepAttr=false;}
    if(data.attrName==='src'&&node.nodeName==='IFRAME'&&!/^data:application\/pdf;base64,[a-zA-Z0-9+/=\s]+$/.test(data.attrValue)){data.keepAttr=false;}
    if(data.attrName==='srcdoc')data.keepAttr=false;
  });
  purifier.addHook('afterSanitizeAttributes',node=>{
    if(node.nodeName==='IFRAME'){if(!node.hasAttribute('src'))node.remove();else node.setAttribute('sandbox','');}
    if(node.nodeName==='A'&&node.getAttribute('target')==='_blank')node.setAttribute('rel','noopener noreferrer');
  });
  let sanitizing=false;
  window.sstSanitizeHTML=function(value,wholeDocument=false){
    if(sanitizing)return String(value??'');
    sanitizing=true;try{return purifier.sanitize(String(value??''),{ADD_TAGS:['iframe'],ADD_DATA_URI_TAGS:['iframe'],ADD_ATTR:['sandbox'],FORBID_TAGS:['script','object','embed','base'],FORBID_ATTR:['srcdoc'],WHOLE_DOCUMENT:wholeDocument,ALLOW_DATA_ATTR:true,SANITIZE_DOM:true});}finally{sanitizing=false;}
  };
  for(const property of ['innerHTML','outerHTML']){
    const desc=Object.getOwnPropertyDescriptor(Element.prototype,property);
    Object.defineProperty(Element.prototype,property,{...desc,set(value){return desc.set.call(this,sanitizing?value:window.sstSanitizeHTML(value));}});
  }
  const insert=Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML=function(position,value){return insert.call(this,position,window.sstSanitizeHTML(value));};
  for(const type of ['click','input','change','keydown','submit'])document.addEventListener(type,event=>{
    for(let node=event.target;node&&node!==document;node=node.parentElement){
      const raw=node.getAttribute?.('data-sst-'+type);if(raw){try{if(run(JSON.parse(raw),event,node)===false)event.preventDefault();}catch(error){console.error('[SST] Ação não concluída',error);}}
      if(event.cancelBubble)break;
    }
  });
  document.addEventListener('DOMContentLoaded',()=>{for(const node of document.querySelectorAll('[onclick],[oninput],[onchange],[onkeydown],[onsubmit]'))for(const attr of [...node.attributes])if(/^on/i.test(attr.name)){convert(node,attr.name,attr.value);node.removeAttribute(attr.name);}});
  window.sstSafeDocumentURL=function(value){
    const url=String(value||'');
    if(!/^data:(?:application\/(?:pdf|msword|vnd\.[a-zA-Z0-9.+-]+|octet-stream)|image\/(?:png|jpeg|webp));base64,[a-zA-Z0-9+/=\s]+$/.test(url))throw new Error('Conteúdo do arquivo inválido ou não permitido.');
    return url;
  };
  window.sstSecurityReady=true;
})();
