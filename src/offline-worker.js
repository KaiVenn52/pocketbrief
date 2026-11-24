/* BUILD and FILES are injected by Vite at build time. */
const scope = self.registration.scope;
const entry = new URL(scope);
const cachePrefix = `pocketbrief-shell:${scope}:`;
const cacheName = cachePrefix + BUILD;
const index = new URL('index.html', scope).href;
const indexPath = new URL(index).pathname;
const shell = new Set(FILES.map(file => new URL(file, scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName)
    .then(cache => cache.addAll([...shell].map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(async keys => {
    const stale = keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName);
    await Promise.all(stale.map(key => caches.delete(key)));
    await self.clients.claim();
  }));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isEntry = request.mode === 'navigate' && url.origin === entry.origin &&
    (url.pathname === entry.pathname || url.pathname === indexPath);
  if (!isEntry && !shell.has(url.href)) return;
  const key = isEntry ? index : url.href;
  event.respondWith(caches.open(cacheName).then(async cache => {
    return await cache.match(key) ?? fetch(request);
  }));
});
