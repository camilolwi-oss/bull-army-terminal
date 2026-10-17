// La terminal se mudó: este service worker reemplaza al de la app instalada y se da de baja solo.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister()));
