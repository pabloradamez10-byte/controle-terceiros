/* Current access is confirmed by the server; local clock changes cannot extend it. */
(function(root){
 'use strict';
 root.sstCreateAccessController=function({query,version,clean,onChange,now=()=>performance.now(),timers=root}){
  let packet=null,expires=0,timer=null,inflight=null,generation=0;
  const unknown=()=>({ok:false,bloqueado:true,pendente:false,excecao:false,confirmado:false,statusTexto:'NÃO CONFIRMADO',motivos:['Situação não confirmada pelo servidor. Verifique a conexão e atualize a consulta.'],avisos:[],dp:{motivos:[],avisos:[]},sesmt:{motivos:[],avisos:[]}});
  function invalidate(){generation++;packet=null;expires=0;timers.clearTimeout(timer);onChange();}
  function get(id){
   if(!packet||now()>=expires||!clean()||String(packet.state_version).replace(' ','T')!==String(version()).replace(' ','T'))return unknown();
   const s=packet.statuses?.[id];
   return s?{...s,statusTexto:s.status,confirmado:true,confirmadoEm:packet.generated_at,regra:packet.rule_version}:unknown();
  }
  async function refresh(){
   if(inflight)return inflight;
   const token=generation,started=now();
   inflight=(async()=>{
    try{
     const result=await query();
     if(token!==generation)return false;
     if(result?.rule_version!=='sst-access-v1'||!result.statuses||typeof result.statuses!=='object'||!/^\d{4}-\d{2}-\d{2}$/.test(result.server_day))throw Error('Resposta inválida');
     const next=new Date(Date.parse(result.server_day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
     const untilMidnight=Date.parse(next+'T00:00:00-03:00')-Date.parse(result.generated_at);
     const lifetime=Math.min(30000,untilMidnight);
     if(!(lifetime>0)||!clean()||String(result.state_version).replace(' ','T')!==String(version()).replace(' ','T'))throw Error('Versão não confirmada');
     packet=result;expires=started+lifetime;
     timers.clearTimeout(timer);timer=timers.setTimeout(()=>{packet=null;onChange();},Math.max(0,expires-now()));onChange();return true;
    }catch{if(token===generation)invalidate();return false;}
   })().finally(()=>{inflight=null;});
   return inflight;
  }
  return {get,refresh,invalidate};
 };
})(typeof window==='object'?window:globalThis);
