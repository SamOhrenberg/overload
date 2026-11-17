import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { api, errorMessage, needsSetup, setToken } from './api';

/**
 * Last-known API responses, so the app still opens (with stale data) offline
 * or while the server is down. Kept here rather than in the service worker
 * because the API is usually another origin — often a LAN IP that Chrome only
 * reaches with a local-network permission the worker can't carry. Keys are the
 * API path alone, so data cached via the LAN address still serves when the
 * public address is the one in use, and vice versa.
 */
const DATA_CACHE = 'overload-data';
const cacheKey = (path: string) => `https://cache.overload.invalid${path}`;
const hasCaches = () => typeof caches !== 'undefined'; // secure contexts only

async function cachePut(path: string, body: string) {
  if (!hasCaches()) return;
  try {
    const cache = await caches.open(DATA_CACHE);
    await cache.put(cacheKey(path), new Response(body, { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    /* quota / private mode — not fatal */
  }
}

async function cacheGet(path: string): Promise<string | null> {
  if (!hasCaches()) return null;
  try {
    const res = await (await caches.open(DATA_CACHE)).match(cacheKey(path));
    return res ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Forget cached data (on logout, so the next user can't see it offline). */
export async function clearDataCache() {
  if (hasCaches()) await caches.delete(DATA_CACHE).catch(() => {});
}

/** Paths whose last load fell back to the cached copy (server unreachable). */
const fromCache = new Set<string>();

/**
 * Did the last load of this screen's view come from the offline cache? A page
 * that just saved a change uses this to keep its optimistic state rather than
 * revert to cached data from before the change.
 */
export function viewServedFromCache(path: string): boolean {
  return fromCache.has(`/api/view${path}`);
}

/** Send the user to first-run setup when no API is configured yet. */
export function requireEndpoint() {
  if (needsSetup()) redirect(307, resolve('/connect'));
}

/**
 * GET a JSON resource for a page `load`. Maps failures onto SvelteKit
 * navigation: no API configured → /connect, 401 → /login, unreachable or
 * server error → last cached copy, else 503 (the "you're offline" screen).
 */
export async function loadJson<T>(path: string): Promise<T> {
  requireEndpoint();
  let res: Response | null = null;
  try {
    res = await api(path);
  } catch {
    /* network failure — fall back to cache below */
  }
  if (res?.status === 401) {
    setToken(null);
    await clearDataCache();
    redirect(307, resolve('/login'));
  }
  if (res?.ok) {
    const text = await res.text();
    fromCache.delete(path);
    void cachePut(path, text);
    return JSON.parse(text) as T;
  }
  if (!res || res.status >= 500) {
    const cached = await cacheGet(path);
    if (cached) {
      fromCache.add(path);
      return JSON.parse(cached) as T;
    }
    error(503, 'Offline');
  }
  error(res.status, await errorMessage(res));
}

/** Load a screen's view-model from /api/view/*. */
export function loadView<T>(path: string): Promise<T> {
  return loadJson<T>(`/api/view${path}`);
}

/** Screens fetched in the background after login so they work offline. */
const WARM = ['/today', '/history', '/exercises', '/routines', '/targets'];

export async function warmCache() {
  if (!hasCaches()) return;
  await Promise.all(
    WARM.map(async (v) => {
      const path = `/api/view${v}`;
      try {
        const res = await api(path, {}, { quiet: true });
        if (res.ok) await cachePut(path, await res.text());
      } catch {
        /* offline — try next time */
      }
    })
  );
}
