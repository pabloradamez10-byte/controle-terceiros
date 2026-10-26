  // Native-only management UI. Reuses the shared authenticated host; never contacts a web backend.
  function nativeDialog(title){
    const overlay=document.createElement('div');overlay.className='sst-sensitive-dialog';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
    overlay.style.cssText='position:fixed;inset:0;z-index:100004;background:#0008;display:flex;align-items:center;justify-content:center;padding:12px';
    const panel=document.createElement('section');panel.style.cssText='background:white;color:#172033;border-radius:16px;padding:20px;width:min(600px,100%);max-height:90vh;overflow:auto;box-sizing:border-box';
    const heading=document.createElement('h2');heading.textContent=title;panel.append(heading);
    const message=document.createElement('p');message.setAttribute('role','status');
    const close=document.createElement('button');close.type='button';close.textContent='Fechar';close.onclick=()=>overlay.remove();panel.append(close,message);overlay.append(panel);document.body.append(overlay);
    return {overlay,panel,message};
  }
  function nativeField(dialog,label,type='text',value=''){
    const wrapper=document.createElement('label');wrapper.textContent=label;wrapper.style.cssText='display:block;margin:12px 0';
    const input=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value;input.style.cssText='display:block;width:100%;box-sizing:border-box';wrapper.append(input);dialog.panel.append(wrapper);return input;
  }
  function nativeButton(dialog,label,task){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.style.cssText='margin:6px 8px 6px 0';
    button.onclick=async()=>{button.disabled=true;dialog.message.textContent='Aguarde...';try{await task();}catch(error){dialog.message.textContent=error.message;}finally{button.disabled=false;}};dialog.panel.append(button);return button;
  }
  function nativeRole(dialog,label){const select=document.createElement('select');for(const[role,name]of[['portaria','Portaria — consulta'],['cadastro','Cadastro'],['sesmt','Gente e Gestão'],['admin','Administrador']]){const option=document.createElement('option');option.value=role;option.textContent=name;select.append(option);}const field=document.createElement('label');field.textContent=label;field.append(select);dialog.panel.append(field);return select;}
  async function nativeDownload(ref){
    if(window.SstAndroid){await nativeCall('platformSaveFile',{ref});return;}
    const artifact=await nativeCall('exportArtifact',{ref});
    const data=URL.createObjectURL(new Blob([JSON.stringify(artifact.value)],{type:'application/json'})),a=document.createElement('a');a.href=data;a.download=artifact.filename;a.click();setTimeout(()=>URL.revokeObjectURL(data),1000);
  }
  function nativeJSONInput(dialog,label,apply){
    const file=nativeField(dialog,label,'file');file.accept='application/json,text/plain,.json';
    file.onchange=async()=>{try{if(!file.files?.[0])return;if(file.files[0].size>32000)throw Error('Arquivo acima do limite.');await apply(JSON.parse(await file.files[0].text()));}catch(error){dialog.message.textContent=error.message;}};return file;
  }
  function showRecoveryRestore(){
    const dialog=nativeDialog('Recuperar minha identidade');
    const info=document.createElement('p');info.textContent='Use o arquivo e o código que você guardou. A recuperação mantém sua identidade e não muda suas permissões. Sem esse material, não é possível abrir a identidade cifrada.';dialog.panel.append(info);
    let kit;nativeJSONInput(dialog,'Arquivo de recuperação',value=>{kit=value;dialog.message.textContent='Arquivo carregado.';});
    const code=nativeField(dialog,'Código de recuperação','password'),password=nativeField(dialog,'Nova senha (mínimo de 10 caracteres)','password');
    nativeButton(dialog,'Recuperar identidade',async()=>{const result=await nativeCall('recoveryRestore',{kit,code:code.value.trim(),password:password.value});code.value='';password.value='';dialog.message.textContent=result.message;});
  }
  function showRecoveryCreate(){
    const dialog=nativeDialog('Proteger meu acesso'),password=nativeField(dialog,'Confirme sua senha atual','password');
    nativeButton(dialog,'Gerar arquivo e código',async()=>{
      const result=await nativeCall('recoveryCreate',{password:password.value});password.value='';
      const code=nativeField(dialog,'Guarde este código fora do aplicativo e separado do arquivo','textarea',result.code);code.readOnly=true;
      nativeButton(dialog,'Salvar arquivo de recuperação',async()=>{nativeDownload(result.exportRef);dialog.message.textContent='Guarde o arquivo e o código. Quem tiver os dois poderá recuperar sua identidade.';});
      dialog.message.textContent='O código não pode ser recuperado depois de fechar esta janela. Não compartilhe o arquivo e o código juntos.';
    });
  }
  async function showLinkJoin(){
    const dialog=nativeDialog('Entrar em um SST existente'),code=nativeField(dialog,'Convite do administrador','textarea');
    nativeJSONInput(dialog,'Ou abrir arquivo de convite',value=>{code.value=value.code??'';});
    const image=nativeField(dialog,'Ou ler QR Code de uma imagem','file');image.accept='image/png,image/jpeg,image/webp';
    image.onchange=async()=>{try{
      const file=image.files[0];if(!file||file.size>8*1024*1024)throw Error('Escolha uma imagem de até 8 MB.');
      const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>12000000){bitmap.close();throw Error('Imagem grande demais.');}
      const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
      const context=canvas.getContext('2d');context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const pixels=context.getImageData(0,0,canvas.width,canvas.height),result=window.jsQR(pixels.data,pixels.width,pixels.height);if(!result)throw Error('QR Code não identificado. Cole o convite ou abra o arquivo.');code.value=result.data;dialog.message.textContent='QR Code lido. Confira os dados antes de continuar.';
    }catch(error){dialog.message.textContent=error.message;}};
    const manual=nativeField(dialog,'Usar envio por arquivo (sem descoberta de rede)','checkbox');manual.style.cssText='width:20px;height:20px;min-height:0';
    const name=nativeField(dialog,'Seu e-mail'),label=nativeField(dialog,'Nome deste aparelho (ex.: PC da Portaria)'),password=nativeField(dialog,'Senha neste aparelho (mínimo de 10 caracteres)','password');
    let kit;nativeJSONInput(dialog,'Opcional: arquivo para usar a mesma identidade de outro aparelho',value=>{kit=value;name.value=value.name??'';});
    const recoveryCode=nativeField(dialog,'Código de recuperação, se estiver usando o arquivo','password');
    let prepared;
    nativeButton(dialog,'Preparar vinculação',async()=>{
      prepared=await nativeCall('linkPrepare',{code:code.value.trim(),name:name.value.trim(),label:label.value.trim(),password:password.value,kit,recoveryCode:recoveryCode.value.trim()});password.value='';recoveryCode.value='';
      const display=nativeField(dialog,'Compare este código nas duas telas','text',prepared.code);display.readOnly=true;
      nativeButton(dialog,'Conferi o código — enviar pedido',async()=>{await nativeCall('linkSubmit',{code:prepared.code,online:!manual.checked});dialog.message.textContent='Aguardando o administrador autorizar. Você pode verificar o resultado abaixo.';});
      nativeButton(dialog,'Salvar pedido para envio manual',async()=>nativeDownload(prepared.exportRef));
      nativeJSONInput(dialog,'Resposta do administrador, se o envio foi manual',async value=>{await nativeCall('linkResponse',{response:value.response});dialog.message.textContent='Resposta aceita. Conclua a vinculação.';});
      nativeButton(dialog,'Verificar e concluir vinculação',async()=>{const status=await nativeCall('linkStatus');if(status.candidate?.state!=='accepted')throw Error('Ainda aguardando autorização.');await nativeCall('linkComplete');location.reload();});
      dialog.message.textContent='Confira o código também no aparelho do administrador antes de enviar o pedido.';
    });
    nativeButton(dialog,'Cancelar pedido',async()=>{await nativeCall('linkCancel');dialog.overlay.remove();});
  }
  async function showDevices(){
    const dialog=nativeDialog('Aparelhos, sincronização e cópias');
    const status=document.createElement('p');dialog.panel.append(status);
    async function refresh(){
      const info=await nativeCall('syncStatus');status.textContent=(info.networkStarted?'Rede ligada':'Rede desligada')+' · '+info.peers+' conexão(ões) · '+info.drafts.filter(d=>!['confirmed'].includes(d.state)).length+' operação(ões) pendente(s) ou em conflito · '+info.checkpoints.length+' cópia(s) com histórico. Última conexão: '+(info.lastPeerAt??'nenhuma nesta sessão')+'. Última atualização recebida: '+(info.lastSyncAt??'nenhuma nesta sessão')+'.';
      if(info.maintenanceError)status.textContent+=' '+info.maintenanceError;
    }
    nativeButton(dialog,'Atualizar situação',refresh);
    nativeButton(dialog,'Ligar sincronização',async()=>{await nativeCall('network',{enabled:true});await refresh();dialog.message.textContent='Rede ligada. Aparelhos autorizados tentarão se encontrar; conectar não garante que todos os dados já chegaram.';});
    nativeButton(dialog,'Desligar sincronização',async()=>{await nativeCall('network',{enabled:false});await refresh();dialog.message.textContent='Consulta local continua disponível.';});
    const makeInvite=async online=>{
      const invite=await nativeCall('linkInvite',{online});const child=nativeDialog('Convite temporário — uso único');
      const qr=document.createElement('img');qr.src=invite.qrDataUrl;qr.alt='QR Code de vinculação';qr.style.cssText='max-width:100%;width:320px;image-rendering:pixelated';child.panel.append(qr);
      const field=nativeField(child,'Convite para colar no outro aparelho','textarea',invite.code);field.readOnly=true;
      nativeButton(child,'Salvar arquivo de convite',async()=>nativeDownload(invite.exportRef));
      nativeButton(child,'Cancelar convite',async()=>{await nativeCall('linkCancel');child.overlay.remove();});child.message.textContent='Válido por 10 minutos. O novo aparelho só recebe acesso após sua aprovação.';
    };
    nativeButton(dialog,'Conectar outro aparelho pela rede',()=>makeInvite(true));
    nativeButton(dialog,'Criar convite para envio por arquivo',()=>makeInvite(false));
    nativeJSONInput(dialog,'Importar pedido enviado por arquivo',async value=>{await nativeCall('linkImportRequest',{request:value.request});dialog.message.textContent='Pedido carregado. Consulte os pedidos abaixo.';});
    nativeButton(dialog,'Consultar pedidos de vinculação',async()=>{
      const requests=await nativeCall('linkRequests');if(!requests.length){dialog.message.textContent='Nenhum pedido aguardando aprovação.';return;}
      for(const request of requests){
        const child=nativeDialog('Autorizar '+request.label),description=document.createElement('p');description.textContent=request.name+' · código exibido aqui: '+request.code;child.panel.append(description);
        const code=nativeField(child,'Digite o código mostrado no aparelho novo'),role=nativeRole(child,'Permissão máxima do aparelho'),userRole=nativeRole(child,'Perfil para uma identidade nova');
        nativeButton(child,'Autorizar aparelho',async()=>{const result=await nativeCall('linkApprove',{id:request.id,code:code.value.trim(),role:role.value,userRole:userRole.value});nativeButton(child,'Salvar resposta para envio manual',async()=>nativeDownload(result.exportRef));child.message.textContent='Aparelho autorizado. A identidade existente conserva suas permissões.';});
        nativeButton(child,'Negar pedido',async()=>{await nativeCall('linkDeny',{id:request.id});child.overlay.remove();});
      }
    });
    nativeButton(dialog,'Listar aparelhos e revogar acesso',async()=>{
      for(const device of await nativeCall('devices')){
        const row=document.createElement('p');row.textContent=(device.label??device.writer.slice(0,12))+' · '+(device.role??'revogado')+(device.current?' · este aparelho':'');dialog.panel.append(row);
        if(!device.current&&device.role==='admin'){
          nativeButton(dialog,'Transferir confirmação para '+(device.label??device.writer.slice(0,12)),async()=>{
            const child=nativeDialog('Transferir confirmação das alterações'),info=document.createElement('p');info.textContent='Os dois aparelhos precisam estar conectados. Depois da transferência, o destino confirmará as alterações. Se ele ficar indisponível, os demais preservarão operações pendentes.';child.panel.append(info);
            nativeButton(child,'Confirmar transferência para este aparelho',async()=>{await nativeCall('handover',{writer:device.writer});child.message.textContent='Transferência confirmada.';});
          });
        }
        if(!device.current&&device.role){nativeButton(dialog,'Revogar '+(device.label??device.writer.slice(0,12)),async()=>{await nativeCall('revokeDevice',{writer:device.writer});dialog.message.textContent='Revogado. Os dados já recebidos pelo aparelho não são apagados remotamente.';});}
      }
    });
    nativeButton(dialog,'Criar cópia com histórico agora',async()=>{const result=await nativeCall('backupCreate');dialog.message.textContent=result.saved?'Cópia cifrada preservada neste aparelho.':'Cópia ainda não criada: '+result.reason;await refresh();});
    nativeButton(dialog,'Consultar cópias e recuperar cadastros',async()=>{
      const info=await nativeCall('syncStatus');for(const copy of info.checkpoints){
        nativeButton(dialog,'Conferir cópia de '+copy.createdAt,async()=>{
          const preview=await nativeCall('backupPreview',{id:copy.id}),child=nativeDialog('Prévia de recuperação');
          const summary=document.createElement('p');summary.textContent=preview.records.length+' registro(s) para recuperar. Registros atuais adicionais serão mantidos; liberações por exceção não serão restauradas.';child.panel.append(summary);
          const reason=nativeField(child,'Motivo da recuperação');
          nativeButton(child,'Confirmar recuperação desta prévia',async()=>{const result=await nativeCall('backupRestore',{id:copy.id,expected:preview.expected,reason:reason.value,confirm:true});child.message.textContent=result.restored+' registro(s) recuperado(s).';await window.tssSupabaseReload();});
        });
      }
    });
    await refresh();
  }
  async function refreshNativeSyncBanner(){
    const info=await nativeCall('syncStatus'),banner=document.getElementById('sst-native-status');
    if(!banner||!session)return;
    const waiting=info.drafts.filter(row=>!['confirmed','conflict'].includes(row.state)).length,conflicts=info.drafts.filter(row=>row.state==='conflict').length;
    banner.textContent='Dados neste aparelho · '+info.peers+' conexão(ões) · '+waiting+' operação(ões) aguardando confirmação · '+conflicts+' conflito(s). Entrada sem confirmação temporal independente.';
    if(info.maintenanceError)banner.textContent+=' '+info.maintenanceError;
  }
  async function showNativeDrafts(){
    const dialog=nativeDialog('Alterações pendentes e conflitos'),status=await nativeCall('syncStatus');
    for(const row of status.drafts.filter(row=>row.state!=='confirmed'))nativeButton(dialog,row.createdAt+' — '+row.state,async()=>{
      const preview=await nativeCall('draftPreview',{id:row.id}),child=nativeDialog('Conferir alteração preservada');
      const details=document.createElement('pre');details.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';details.textContent=JSON.stringify(preview.changes,null,2);child.panel.append(details);
      child.message.textContent=preview.canRetry?'Compare o pedido preservado com o conteúdo atual. O reenvio precisa de confirmação.':'A operação foi preservada. Aguarde a confirmação ou revise pelos cadastros; não há reenvio automático de um conflito.';
      if(preview.canRetry){const reason=nativeField(child,'Motivo do reenvio');nativeButton(child,'Confirmar reenvio desta prévia',async()=>{await nativeCall('draftRetry',{id:row.id,expected:preview.expected,reason:reason.value,confirm:true});child.message.textContent='Alteração reenviada e confirmada.';await window.tssSupabaseReload();});}
    });
  }
  function installNativeDeviceUI(){
    const auth=document.getElementById('tss-auth-form');
    if(!document.getElementById('sst-link-existing')){const button=document.createElement('button');button.id='sst-link-existing';button.type='button';button.textContent='Entrar em um SST existente';button.onclick=showLinkJoin;auth.append(button);}
    document.getElementById('tss-auth-recover').onclick=showRecoveryRestore;
  }
  function renderNativeDeviceToolbar(){
    if(document.getElementById('sst-device-toolbar'))return;
    const toolbar=document.createElement('section');toolbar.id='sst-device-toolbar';
    const access=document.createElement('button');access.type='button';access.textContent='Proteger meu acesso';access.onclick=showRecoveryCreate;toolbar.append(access);
    if(can('cadastrar')){const drafts=document.createElement('button');drafts.type='button';drafts.textContent='Pendências e conflitos';drafts.onclick=()=>showNativeDrafts().catch(error=>authError(error.message));toolbar.append(drafts);}
    if(membership?.role==='admin'){const button=document.createElement('button');button.type='button';button.textContent='Aparelhos e cópias';button.onclick=()=>showDevices().catch(error=>authError(error.message));toolbar.append(button);}
    document.querySelector('main').prepend(toolbar);
  }
