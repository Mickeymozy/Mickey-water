const CACHE='mickey-water-v2';
const APP_SHELL=['/','/index.html','/dashboard.html','/admin.html','/forgot-password.html','/reset-password.html','/receipt-print.js','/manifest.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||event.request.url.includes('/api/'))return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(response=>response||caches.match('/index.html'))));});
