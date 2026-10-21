import { validateFile } from './validate.mjs';
const base = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const origin = 'https://pabloradamez10-byte.github.io';
const headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
const reply = (value:unknown,status=200) => new Response(JSON.stringify(value),{status,headers});
const adminHeaders = {apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
async function database(path:string,options:RequestInit={}) {
 const result=await fetch(base+'/rest/v1/'+path,{...options,headers:{...adminHeaders,...options.headers}});
 if(!result.ok)throw Error('Operação de documentos não confirmada no banco.');
 return result.status===204?null:result.json();
}
function encode(bytes:Uint8Array) {let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Método não permitido.'},405);
 if(req.headers.get('origin') && req.headers.get('origin')!==origin)return reply({error:'Origem não permitida.'},403);
 try {
  const authorization=req.headers.get('authorization')||'';
  const auth=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:authorization},cache:'no-store'});
  if(!auth.ok)return reply({error:'Login necessário.'},401);
  const user=await auth.json();
  const members=await database('sst_members?user_id=eq.'+encodeURIComponent(user.id)+'&select=role,permissoes,ativo,email');
  const member=members?.[0];
  const edit=member?.ativo && (member.role==='admin'||member.permissoes?.cadastrar===true);
  const view=member?.ativo && (edit||member.permissoes?.liberar===true);
  if(!view)return reply({error:'Perfil sem permissão para documentos.'},403);
  if(Number(req.headers.get('content-length')||0)>1250000)return reply({error:'Arquivo acima do limite.'},413);
  const text=await req.text();if(text.length>1250000)return reply({error:'Arquivo acima do limite.'},413);
  const body=JSON.parse(text);
  if(body.action==='download') {
   if(typeof body.id!=='string'||!/^[a-f0-9-]{36}$/.test(body.id))return reply({error:'Identificador inválido.'},400);
   const rows=await database('sst_document_files?id=eq.'+encodeURIComponent(body.id)+'&select=*');
   const file=rows?.[0];if(!file)return reply({error:'Arquivo não encontrado.'},404);
   const data=await fetch(base+'/storage/v1/object/authenticated/sst-documentos/'+file.path,{headers:{apikey:service,Authorization:'Bearer '+service},cache:'no-store'});
   if(!data.ok)throw Error('Arquivo indisponível.');
   const bytes=new Uint8Array(await data.arrayBuffer());
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
   if(hash!==file.sha256||bytes.length!==file.size)throw Error('Integridade do arquivo não confirmada.');
   return reply({dataUrl:'data:'+file.mime+';base64,'+encode(bytes)});
  }
  if(body.action!=='upload'||!edit)return reply({error:'Envio não autorizado.'},403);
  if(!['terceiro','empresa'].includes(body.kind)||typeof body.ownerId!=='string'||body.ownerId.length>200)return reply({error:'Vínculo inválido.'},400);
  const states=await database('app_data?key=eq.controle_terceiros_sst_state_v1&select=data');
  if(!states?.[0]?.data?.[body.kind==='terceiro'?'terceiros':'empresas']?.some((r:{id:string})=>r.id===body.ownerId))return reply({error:'Salve o cadastro antes de anexar o documento.'},400);
  if(typeof body.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64))return reply({error:'Arquivo inválido.'},400);
  const bytes=Uint8Array.from(atob(body.base64),c=>c.charCodeAt(0));
  try{validateFile(bytes,body.filename,body.mime);}catch(e){return reply({error:(e as Error).message},400);}
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const id=crypto.randomUUID(),path=id+'/original';
  const stored=await fetch(base+'/storage/v1/object/sst-documentos/'+path,{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':body.mime,'x-upsert':'false','Cache-Control':'no-store'},body:bytes});
  if(!stored.ok)throw Error('Não foi possível armazenar o arquivo.');
  const record={id,owner_kind:body.kind,owner_id:body.ownerId,path,filename:body.filename,mime:body.mime,size:bytes.length,sha256,created_by:user.id,reason:'Recepção de arquivo para anexação; vínculo sujeito ao salvamento auditado do cadastro'};
  const saved=await database('sst_document_files',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(record)});
  return reply({storageId:id,storagePath:path,sha256,nome:body.filename,mime:body.mime,tamanho:bytes.length,criadoEm:saved[0].created_at});
 }catch{ return reply({error:'Não foi possível confirmar a operação. Verifique a conexão e tente novamente.'},500); }
});
