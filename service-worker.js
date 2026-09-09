const CACHE_NAME = 'bourbon-buddies-shell-v1';
const APP_SHELL = [
  './', './index.html', './calendar.html', './directory.html', './newsletters.html',
  './rules.html', './themes.html', './offline.html', './styles.css', './pwa.js',
  './app.js', './data/club-data.js', './assets/bbc-logo.jpg',
  './assets/bbc-logo-transparent.png', './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./offline.html')));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
