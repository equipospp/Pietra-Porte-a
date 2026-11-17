// Service worker: deja la app guardada en el teléfono para que abra aunque no haya señal.
// Los datos (tareas, stock, avisos) los maneja la app: guarda copia local y sube cuando vuelve la señal.
const CACHE = 'pietra-v2'
const BASICOS = ['/', '/index.html', '/manifest.webmanifest', '/logo-blanco.png', '/logo-rojo.png',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png',
  '/fonts/BebasNeue-Bold.otf', '/fonts/BebasNeue-Regular.ttf']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE)
    await c.addAll(BASICOS).catch(() => {})
    // También los archivos de la app (JS y CSS con nombre único por versión)
    try {
      const html = await (await fetch('/index.html', { cache: 'no-store' })).text()
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
      await c.addAll(assets)
      await c.put('/index.html', new Response(html, { headers: { 'Content-Type': 'text/html' } }))
    } catch { /* sin señal al instalar: se completa en la próxima visita */ }
    self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase y otros: siempre directo

  // Páginas: primero la red (para tener la última versión), si no hay señal la copia guardada
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 4000)
        const r = await fetch(req, { signal: ctrl.signal })
        clearTimeout(t)
        if (r.ok) (await caches.open(CACHE)).put('/index.html', r.clone())
        return r
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error()
      }
    })())
    return
  }

  // Archivos de la app: la copia guardada si existe; si no, de la red y se guarda
  event.respondWith((async () => {
    const guardado = await caches.match(req)
    if (guardado) return guardado
    try {
      const r = await fetch(req)
      if (r.ok && (url.pathname.startsWith('/assets/') || BASICOS.includes(url.pathname))) (await caches.open(CACHE)).put(req, r.clone())
      return r
    } catch {
      return Response.error()
    }
  })())
})
