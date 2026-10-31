/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `overload-cache-${version}`;
// The app shell + static assets to precache for offline launch.
const ASSETS = [...build, ...files];

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache API or auth traffic — always go to the network.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/healthz')) return;

  // Cache-first for precached assets.
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
    return;
  }

  // Network-first for navigations, falling back to the cached shell offline.
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((c) => c ?? caches.match('/')) as Promise<Response>)
  );
});
