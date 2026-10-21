  function configurePermissionUi(){
    const userButton = document.getElementById('tss-users-open');
    userButton.hidden = membership?.role !== 'admin';
    if (membership?.role === 'admin') installAuditButton();
    ['tss-audit-open'].forEach(id=>{const b=document.getElementById(id);if(b)b.hidden=membership?.role !== 'admin';});
    document.querySelectorAll('nav button').forEach(button => {
      if (['Cadastro','Dados'].includes(button.textContent.trim())) button.hidden = !can('cadastrar');
    });
    document.querySelectorAll('#page-dashboard button').forEach(button => {
      if (button.textContent.includes('Novo Terceiro')) button.hidden = !can('cadastrar');
    });
    document.querySelectorAll('#page-empresas .page-actions button, #page-treinamentos .page-actions button').forEach(button => {
      button.hidden = !can('cadastrar');
    });
  }
