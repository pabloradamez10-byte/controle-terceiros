/* P2P UI adapter. Only included by the isolated native UI package builder. */
(function(){
  'use strict';
  window.sstNativeMode = true;
  const native = window.sstNativeHost;
  const SUPABASE_URL = 'native://sst', USER_FUNCTION = SUPABASE_URL + '/users', SESSION_KEY = 'tss_auth_session';
  const INSTANCE_ID = 'tss_instance_id', LOCAL_SYNC_MARK = 'tss_supabase_last_sync', LOCAL_CHANGE_MARK = 'tss_local_last_change';
  const DATA_KEYS = { terceiros:'terceiros', empresas:'empresas', treinamentos:'treinamentos', historico:'historico', anexosTerceiros:'anexosTerceiros', anexosEmpresas:'anexosEmpresas', arquivosTerceirosV16:'arquivosTerceirosV16', arquivosEmpresasV26:'arquivosEmpresasV26' };
  const ROLE_DEFAULTS = { admin:{consultar:true,cadastrar:true,liberar:true}, cadastro:{consultar:true,cadastrar:true,liberar:false}, sesmt:{consultar:true,cadastrar:false,liberar:true}, portaria:{consultar:true,cadastrar:false,liberar:false} };
  let nativeScrubbed=false;
  function endNativeSession(){nativeScrubbed=true;bootFinished=false;nativeObserver?.disconnect();forgetSession();}
  let session=null, membership=null, sessionGeneration=0, loggingOut=false, exceptionCache={}, syncTimer=null, isApplyingRemote=false, bootFinished=false;
  const can = action => membership?.ativo === true && membership.permissoes?.[action] === true;
  window.tssPode = can;
  window.sstCanDownloadDocuments = () => can('consultar') && membership?.role !== 'portaria';
  localStorage.setItem(INSTANCE_ID, 'native-device');
  function authError(message){ document.getElementById('tss-auth-error').textContent=message||''; }
  async function nativeCall(action,body){
    if(!native||typeof native.request!=='function')throw Error('A ponte local do aplicativo não foi carregada. Abra pelo ambiente nativo de homologação.');
    return native.request({action,body});
  }
  async function authToken(grant,credentials){
    const generation=sessionGeneration;
    await nativeCall(grant==='initializeOwner'?'initializeOwner':'login',credentials);
    if(generation!==sessionGeneration)throw Error('Sessão encerrada.');
    session={native:true};
  }
  async function ensureSession(){
    const status=await nativeCall('status');
    if(status.locked)return false;
    session={native:true};return true;
  }
  async function loadMembership(){
    membership=await nativeCall('membership');
    window.tssUsuarioAtual=()=>membership?.user??null;
    if(!can('consultar'))throw Error('Conta sem permissão para consultar.');
  }
  async function authorizedFetch(url,options={}){
    const generation=sessionGeneration;
    let data,body=options.body?JSON.parse(options.body):undefined;
    const route=new URL(url).pathname;
    try{
      if(route==='/auth/v1/user')data=(await nativeCall('membership')).user;
      else if(route==='/rest/v1/sst_members')data=[await nativeCall('membership')];
      else if(route==='/rest/v1/rpc/sst_read_state')data=await nativeCall('state');
      else if(route==='/rest/v1/rpc/sst_save_state')data=await nativeCall('saveState',body);
      else if(route==='/rest/v1/rpc/sst_read_exceptions')data=await nativeCall('exceptions');
      else if(route==='/rest/v1/rpc/sst_save_exception')data=await nativeCall('saveException',body);
      else if(route==='/rest/v1/sst_audit_log')data=(await nativeCall('audit')).slice(Number(new URL(url).searchParams.get('offset')||0),Number(new URL(url).searchParams.get('offset')||0)+50);
      else if(route==='/rest/v1/rpc/sst_audit_report')data=await nativeCall('historicalReport',body);
      else if(route==='/users'){
        if(body&&!body.action)body.password=document.getElementById('tss-native-user-password')?.value;
        data=await nativeCall('users',body);
        const password=document.getElementById('tss-native-user-password');if(password)password.value='';
      }else throw Error('Operação não disponível no modo P2P.');
      if(generation!==sessionGeneration)throw Error('Sessão encerrada.');
      return {ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)};
    }catch(error){
      if(generation!==sessionGeneration)throw Error('Sessão encerrada.');
      const status=await nativeCall('status').catch(()=>({locked:true}));
      if(status.locked)endNativeSession();
      return {ok:false,status:409,json:async()=>({message:error.message,error:error.message}),text:async()=>error.message};
    }
  }
  // Keep the original access gate fail-closed: a local clock is not a trusted time source.
  const accessController={ invalidate(){}, async refresh(){return false;}, get(id){
    return {ok:false,bloqueado:true,pendente:false,excecao:false,confirmado:false,statusTexto:'NÃO CONFIRMADO',motivos:['Homologação P2P: consulta local sem confirmação temporal independente. Não autorize entrada por esta tela.'],avisos:[],dp:{motivos:[],avisos:[]},sesmt:{motivos:[],avisos:[]}};
  }};
  window.getStatus=t=>accessController.get(t.id);
  window.sstPrivateDocuments={
    request:body=>nativeCall('documents',body),
    async upload(kind,ownerId,file){
      const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Falha na leitura.'));r.readAsDataURL(file);});
      return this.request({action:'upload',kind,ownerId:String(ownerId),filename:file.name,mime:file.type,base64:String(dataUrl).split(',')[1]});
    },
    async dataURL(item,purpose='view'){
      if(purpose==='download'&&!window.sstCanDownloadDocuments())throw Error('Seu perfil permite visualizar, sem baixar.');
      const generation=sessionGeneration;
      const data=item.storageId?(await this.request({action:purpose,id:item.storageId})).dataUrl:item.dataUrl;
      if(generation!==sessionGeneration||!session||!can('consultar'))throw Error('Sessão encerrada.');
      return window.sstSafeDocumentURL(data);
    }
  };
