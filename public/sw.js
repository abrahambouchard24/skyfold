// Skyfold service worker: makes the game installable and playable offline.
// Pages: network first (so a new deploy shows up), falling back to the cached copy offline.
// Built assets (hashed file names) and fonts: cache first. Online play (PeerJS) is never cached.
const CACHE = 'skyfold-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return;
  const page = req.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (!page) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      if (page && res.ok) pruneAssets(cache, await res.clone().text());
      return res;
    } catch (err) {
      const hit = await cache.match(req) || (page ? await cache.match('./') : undefined);
      if (hit) return hit;
      throw err;
    }
  })());
});

/** After a new deploy, drop the cached entry files the new page no longer uses. */
async function pruneAssets(cache, html) {
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    const i = path.indexOf('/assets/');
    // Only the entry files the page names directly (index-<hash>.js / .css); other chunks are kept.
    if (i >= 0 && path.slice(i + 8).startsWith('index-') && !html.includes(path.slice(i + 1))) await cache.delete(req);
  }
}
