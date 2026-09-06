const CACHE_NAME='webdollar-wallet-v15';
const APP_SHELL=['./','./index.html','./styles.css','./manifest.json','./assets/icon-192.png','./assets/icon-512.png','./src/app.js','./src/core/constants.js','./src/core/crypto.js','./src/core/ed25519.js','./src/core/event-bus.js','./src/core/i18n.js','./src/core/native-socket.js','./src/core/network.js','./src/core/plugin-manager.js','./src/core/qr.js','./src/core/transaction.js','./src/core/wallet.js','./src/core/webd-format.js','./src/locales/es.json','./src/locales/en.json','./src/vendor/dependencies.js','./src/vendor/argon2-bundled.min.js','./src/modules/mining.js','./src/modules/offline.js','./src/workers/mining-pow-worker.js'];
const allowed=new Set(APP_SHELL.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('webdollar-wallet-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  // Allowlist static assets only: never cache balances, RPCs, private files or node data.
  if(event.request.method!=='GET'||!allowed.has(event.request.url))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(async()=>{const cached=await caches.match(event.request);return cached||new Response('Recurso offline no disponible',{status:503});}));
});
