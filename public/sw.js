// Service worker mínimo: permite instalar la app en el celular.
// No guarda nada en caché: los datos siempre se leen en vivo de Supabase.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
