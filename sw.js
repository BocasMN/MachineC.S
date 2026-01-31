self.addEventListener('install', e => {
  e.waitUntil(
    caches.open('mre-cache-v1').then(cache => cache.addAll([
      './',
      './index.html',
      './app.js',
      './manifest.json'
    ]))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
