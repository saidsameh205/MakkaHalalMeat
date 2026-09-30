const CACHE = 'makka-halal-v12';
const ASSETS = ['./', './index.html', './manifest.json', './hero-banner.png', './banner-sign.jpg', './icon-180.png', './icon-192.png', './icon-512.png',
  './gif.html', './gif-manifest.json', './gif-icon-180.png', './gif-icon-192.png', './gif-icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Never cache API/data calls — always go to the network for Supabase and
  // Netlify functions so prices, orders and stock are never served stale.
  if (e.request.url.includes('/rest/v1/') || e.request.url.includes('/.netlify/functions/')) return;

  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
