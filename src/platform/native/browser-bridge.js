(function(){
  'use strict';
  if(window.sstNativeHost?.request)return; // An embedded Android/desktop host may inject its own IPC.
  let bootstrap;
  Object.defineProperty(window,'sstNativeHost',{value:Object.freeze({async request(body){
    bootstrap??=fetch('./__sst_native/bootstrap',{cache:'no-store',headers:{'X-SST-Bootstrap':'1'}}).then(async response=>{if(!response.ok)throw Error('Ponte local indisponível.');return response.json();});
    const {token}=await bootstrap;
    const response=await fetch('./__sst_native/command',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-SST-Native':token},body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'Operação local não confirmada.');
    return result.data;
  }}),writable:false,configurable:false});
})();
