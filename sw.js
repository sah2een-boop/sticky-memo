const CACHE_NAME = 'sticky-memo-v3';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/theme.js',
    './js/markdown.js',
    './js/search.js',
    './js/notes.js',
    './js/walls.js',
    './js/firebase.js',
    './js/app.js'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
