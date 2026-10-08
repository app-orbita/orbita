// Service worker: guarda la "cáscara" de la app para que abra rápido.
// Los datos siempre se piden en línea a Supabase.
// Si cambiás archivos de la app, subí el número de versión.
const VERSION = 'orbita-v6';
const SHELL = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/ui.js', 'js/utils.js', 'js/data.js', 'js/config.js', 'js/importer.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Red primero (para ver siempre la última versión); si no hay conexión, usa la copia guardada.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    // no-cache: siempre pregunta al servidor si hay versión nueva (evita ver archivos viejos hasta 10 min)
    fetch(e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' })).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
