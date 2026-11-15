// Service worker: nodig zodat Android de site als app kan installeren.
// Bewust simpel: altijd eerst het netwerk (altijd de nieuwste versie en data),
// alleen als je offline bent laten we de laatst geladen pagina zien.
const CACHE = 'scbotlek-shell-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  // Alleen paginanavigatie; Supabase/Sportlink-verzoeken gaan ongemoeid naar het netwerk
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put('shell', copy))
        return res
      })
      .catch(() => caches.open(CACHE).then((c) => c.match('shell')).then((r) => r || Response.error())),
  )
})
