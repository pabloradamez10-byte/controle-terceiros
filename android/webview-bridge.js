(function(){
 'use strict';
 const channel=window.SstAndroid,pending=new Map();let serial=0;
 if(!channel)return;
 channel.onmessage=event=>{
  let message;try{message=JSON.parse(event.data);}catch{return;}
  const entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);clearTimeout(entry.timer);
  if(message.ok)entry.resolve(message.data);else entry.reject(Error(message.error||'Operação local recusada.'));
 };
 Object.defineProperty(window,'sstNativeHost',{value:Object.freeze({request(request){
  if(pending.size>=20)return Promise.reject(Error('Aguarde a operação anterior.'));
  return new Promise((resolve,reject)=>{
   const id=String(++serial),timer=setTimeout(()=>{pending.delete(id);reject(Error('O núcleo local não respondeu.'));},30000);
   pending.set(id,{resolve,reject,timer});
   try{channel.postMessage(JSON.stringify({id,action:request.action,body:request.body}));}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
 }}),writable:false,configurable:false});
})();
