// Service worker: guarda la "cáscara" de la app para que abra rápido,
// muestra las notificaciones (recordatorios) y ayuda a guardar la contraseña.
// Los datos siempre se piden en línea a Supabase.
// Si cambiás archivos de la app, subí el número de versión.
const VERSION = 'orbita-v9';
const SHELL = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/ui.js', 'js/utils.js', 'js/data.js', 'js/config.js', 'js/importer.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Envío del formulario de ingreso (solo para que el navegador ofrezca guardar la contraseña):
  // se responde acá mismo, sin mandar nada a internet.
  if (e.request.method === 'POST' && url.pathname.endsWith('/__login')) {
    e.respondWith(new Response('<!doctype html><title>ok</title>', { headers: { 'Content-Type': 'text/html' } }));
    return;
  }
  if (e.request.method !== 'GET') return;
  // Red primero (para ver siempre la última versión); si no hay conexión, usa la copia guardada.
  e.respondWith(
    // no-cache: siempre pregunta al servidor si hay versión nueva (evita ver archivos viejos hasta 10 min)
    fetch(e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' })).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});

// ---------- Notificaciones (recordatorios que manda el servidor) ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Órbita', {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => c.url.startsWith(self.registration.scope));
    if (w) { w.navigate?.(target)?.catch(() => {}); return w.focus(); }
    return self.clients.openWindow(target);
  }));
});
