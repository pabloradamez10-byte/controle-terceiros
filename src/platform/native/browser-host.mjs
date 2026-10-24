import http from 'node:http';
import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// Per-device homologation adapter, bound exclusively to loopback. Not a central server.
export async function createBrowserHost({service,uiDirectory,port=0}){
  const root=path.resolve(uiDirectory),manifest=JSON.parse(await readFile(path.join(root,'release.json'),'utf8'));
  if(manifest.mode!=='native-p2p-homologacao')throw Error('Pacote de interface incorreto.');
  const files=new Map(manifest.files.map(file=>['/'+file.path.replaceAll(path.sep,'/'),file.sha256]));
  const token=randomBytes(32).toString('hex'),cookie=randomBytes(32).toString('hex');
  let origin;
  const equal=(a,b)=>typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
  const server=http.createServer(async(req,res)=>{
    const reply=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    try{
      if(req.headers.host!==new URL(origin).host)return reply({ok:false,error:'Origem local inválida.'},403);
      const url=new URL(req.url,origin),isAPI=url.pathname.startsWith('/__sst_native/');
      if(isAPI){
        const referer=req.headers.referer;
        const source=req.headers.origin||(referer?new URL(referer).origin:null);
        if(source!==origin||(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin'))return reply({ok:false,error:'Origem não permitida.'},403);
        const suppliedCookie=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('sst_native_host='))?.slice(16);
        if(!equal(suppliedCookie,cookie))return reply({ok:false,error:'Sessão de ponte inválida.'},403);
        if(url.pathname==='/__sst_native/bootstrap'&&req.method==='GET'&&req.headers['x-sst-bootstrap']==='1')return reply({token});
        if(url.pathname!=='/__sst_native/command'||req.method!=='POST'||!equal(req.headers['x-sst-native'],token)||!String(req.headers['content-type']).startsWith('application/json'))return reply({ok:false,error:'Canal local inválido.'},403);
        let size=0;const chunks=[];
        for await(const chunk of req){size+=chunk.length;if(size>1400000)return reply({ok:false,error:'Requisição acima do limite.'},413);chunks.push(chunk);}
        try{return reply({ok:true,data:await service.execute(JSON.parse(Buffer.concat(chunks).toString('utf8')))});}
        catch(error){return reply({ok:false,error:error.message},400);}
      }
      if(!['GET','HEAD'].includes(req.method))return reply({ok:false,error:'Método inválido.'},405);
      const name=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
      if(!files.has(name))return reply({ok:false,error:'Arquivo não disponível.'},404);
      const file=path.resolve(root,'.'+name);
      if(!file.startsWith(root+path.sep))return reply({ok:false,error:'Caminho inválido.'},403);
      const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Arquivo inválido.');
      const bytes=await readFile(file);
      if(createHash('sha256').update(bytes).digest('hex')!==files.get(name))throw Error('Integridade da interface não confirmada.');
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'}[path.extname(file)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Set-Cookie':'sst_native_host='+cookie+'; HttpOnly; SameSite=Strict; Path=/'});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch{return reply({ok:false,error:'Não foi possível atender a requisição local.'},500);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{origin='http://127.0.0.1:'+server.address().port;resolve();});});
  return {origin,close:()=>new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections();})};
}
