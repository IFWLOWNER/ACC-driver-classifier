/* IFWL Licence Centre service worker.
   Purpose: make the site installable as an app and give a friendly page when there is no signal.
   It NEVER touches anything that is not a plain GET on this same site, so Discord login, the rtGate
   server calls, Patreon links and Google Fonts all go straight to the network exactly as before.
   Pages: network first (always the newest version), falling back to the last copy, then offline.html.
   Static files (css, js, images): the copy already stored is shown at once and refreshed behind the scenes. */
const VERSION = 'ifwl-app-v2';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';
const MAX_RUNTIME = 120;
const PRECACHE = ['offline.html', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.indexOf('ifwl-app-') === 0 && k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

const sensitive = (u) => /[?&](code|token|state|access_token|id_token|error)=/i.test(u.search);
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_RUNTIME; i++) await cache.delete(keys[i]);
}
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;       // not ours: let the browser do its normal thing
  if (url.pathname.endsWith('/sw.js')) return;
  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0;
  if (isPage) {
    e.respondWith((async () => {
      try {
        const res = await Promise.race([fetch(req), timeout(12000)]);
        if (res && res.ok && !sensitive(url) && !res.redirected) { const c = await caches.open(RUNTIME); c.put(req, res.clone()).then(() => trim(c)).catch(() => {}); }
        return res;
      } catch (err) {
        const c = await caches.open(RUNTIME);
        const hit = (await c.match(req, { ignoreSearch: true })) || (await caches.match(req, { ignoreSearch: true }));
        return hit || (await caches.match('offline.html')) || new Response('You are offline.', { status: 503, headers: { 'content-type': 'text/plain' } });
      }
    })());
    return;
  }
  if (sensitive(url)) return;
  const isImg = /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(url.pathname);
  const isCode = /\.(?:css|js)$/i.test(url.pathname);
  if (isImg || (isCode && /[?&]v=/.test(url.search))) {
    // images and version-stamped css/js never change under the same address: show the stored copy at once, refresh behind the scenes
    e.respondWith((async () => {
      const c = await caches.open(RUNTIME), hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res && res.ok) { c.put(req, res.clone()).then(() => trim(c)).catch(() => {}); } return res; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
    return;
  }
  if (isCode) {
    // css/js without a version stamp (for example ifwl-stats-engine.js): always the newest, stored copy only if offline
    e.respondWith((async () => {
      const c = await caches.open(RUNTIME);
      try { const res = await fetch(req); if (res && res.ok) { c.put(req, res.clone()).then(() => trim(c)).catch(() => {}); } return res; }
      catch (err) { return (await c.match(req)) || new Response('', { status: 504 }); }
    })());
  }
});
