// Deutsch Tutor service worker — offline-capable cache
// Strategy:
//   - /api/* → network only (AI calls need the network)
//   - static assets (HTML/JS/JSON/manifest/icons) → stale-while-revalidate
//   - everything else → network first, fall back to cache

const VERSION = 'dt-v3';
const CACHE = `deutsch-tutor-${VERSION}`;
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/curriculum-data.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GETs
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never cache AI chat API
  if (url.pathname.startsWith('/api/')) {
    return; // let the browser handle it normally (network)
  }

  // Stale-while-revalidate for static assets
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => cached); // offline → use cache
      return cached || fetchPromise;
    })
  );
});
