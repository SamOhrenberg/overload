/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { base, build, files, version } from '$service-worker';

/**
 * The UI is a client-side app (served by the API server or as static files on
 * GitHub Pages), so offline launch only needs the app shell + bundles. Screen
 * data is cached by the client itself (see $lib/client/load.ts), and API
 * traffic — usually another origin — is never touched here.
 */
const CACHE = `overload-cache-${version}`;
const SHELL = `${base}/`;
const OFFLINE_PAGE = `${base}/offline.html`;
const ASSETS = [...build, ...files];

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([...ASSETS, SHELL]))
      .then(() => sw.skipWaiting())
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Only this worker's versioned caches; the client's data cache is separate.
      .then((keys) =>
        Promise.all(
          keys.filter((k) => (k.startsWith('overload-cache-') || k.startsWith('overload-runtime-')) && k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  // Cache-first for precached, immutable assets.
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
    return;
  }

  // Page loads: every route is the same app shell. Network first (picks up new
  // deploys), else the cached shell, else a standalone offline screen.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await caches.match(SHELL)) ?? (await caches.match(OFFLINE_PAGE)) ?? Response.error()
      )
    );
  }
});
