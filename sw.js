/* Only the installable app shell is cached. Game requests and photos are never cached. */
const CACHE = 'findit-shell-v3.0.0';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/config.js',
  './js/api.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/findit-192.png',
  './icons/findit-512.png',
  './file_00000000cad881f492198522f5cb5b90.png',
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('findit-') && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const u = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    u.origin !== self.location.origin ||
    u.search ||
    !SHELL.some((p) => new URL(p, self.registration.scope).pathname === u.pathname)
  )
    return;
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' }).catch(() => caches.match(event.request)),
  );
});
