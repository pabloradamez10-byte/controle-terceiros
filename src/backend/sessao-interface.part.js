  function lockApp(message){
    document.body.classList.remove('tss-authenticated');
    document.getElementById('tss-auth-overlay').hidden = false;
    if (message) authError(message);
  }
  function unlockApp(){
    document.body.classList.add('tss-authenticated');
    document.getElementById('tss-auth-overlay').hidden = true;
    authError('');
    configurePermissionUi();
    if (!document.getElementById('tss-logout')) {
      const button = document.createElement('button');
      button.id = 'tss-logout';
      button.textContent = 'Sair';
      button.style.cssText = 'position:fixed;right:12px;bottom:52px;z-index:99999;padding:7px 12px;border-radius:8px;border:1px solid #cbd5e1;background:white;cursor:pointer';
      button.onclick = () => window.tssSair();
      document.body.appendChild(button);
    }
  }
  function forgetSession(){
    sessionGeneration++; clearTimeout(syncTimer);
    accessController.invalidate(); window.sstSelectedPersonId=null;
    session=null; membership=null; exceptionCache={}; auditBaseline=null; auditStamp=null;
    window.tssUsuarioAtual=()=>null; window.sstClearPrivateData();
    document.querySelector('main')?.replaceChildren();
    document.querySelectorAll('[id^="modal-"],#tss-users-modal,.sst-sensitive-dialog,.sst-report-overlay,.v26-doc-preview-overlay').forEach(node=>{node.replaceChildren();node.hidden=true;});
    lockApp('Sessão encerrada.');
  }
