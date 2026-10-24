const CACHE_NAME = 'portal-terceiros-sst-nativeui-20261024-1';
const APP_SHELL = ['./assets/js/core.js','./assets/js/pendencias.js','./assets/js/matriz-treinamentos.js','./assets/js/portaria-express.js','./assets/js/portaria-semaforo.js','./assets/js/documentos-compatibilidade.js','./assets/js/backend-sessao-usuarios.js','./assets/css/base.css','./assets/css/autenticacao.css','./assets/css/mobile.css','./assets/css/pendencias.css','./assets/css/portaria.css','./assets/css/portaria-acabamento.css','./','./index.html','./security.js?v=20261024-p2p-ui-1','./access.js?v=20261021-2','./documentos.js?v=20261024-p2p-ui-1','./relatorios.js?v=20261020-1','./vendor/purify-3.4.17.min.js','./vendor/xlsx-0.20.3.full.min.js','./manifest.json','./icon-192.png','./icon-512.png'];
const ALLOWED = new Set(APP_SHELL.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('portal-terceiros-sst-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||request.headers.has('authorization')||!ALLOWED.has(request.url))return;
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)));}return response;}).catch(async()=>{const cached=await caches.match(request);if(cached)return cached;throw new Error('Arquivo da aplicação indisponível.');}));
});
