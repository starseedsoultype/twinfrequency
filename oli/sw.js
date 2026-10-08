// Oli app shell. Network first, so a new version of the page is picked up at once;
// the cached copy only opens the app when there is no connection.
const CACHE = 'oli-shell-v2'
const SHELL = ['./', 'manifest.webmanifest', 'vendor/supabase-2.45.4.js', 'icons/icon-192.png', 'icons/icon-512.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  // Only this app's own files; Supabase, fonts and everything else go straight to the network.
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL('./', location).pathname)) return
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)) }
        return res
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match('./')))
  )
})
