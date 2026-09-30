// Service worker mínimo para que la terminal sea instalable (PWA).
// No guarda nada en caché a propósito: la lista de accesos y la página siempre se piden a la red,
// así una revocación o un vencimiento se aplican aunque la app esté instalada.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bull Army Terminal</title>' +
    '<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0B0B0C;color:#ECE9E2;font:16px system-ui;text-align:center">' +
    '<div><h1 style="font-size:22px">Sin conexión</h1><p style="color:#8E8B84">La terminal necesita internet para mostrar datos en vivo.</p></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
