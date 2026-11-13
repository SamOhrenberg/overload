import { browser } from '$app/environment';

/**
 * Configurable API client. The UI can be served from the home server, from
 * GitHub Pages, or run with no backend at all (local-only). The device stores
 * one or more API base URLs; on use we pick the first that answers /healthz —
 * which transparently handles the split-DNS case (LAN IP at home, public URL
 * away). See docs/09-deployment-and-client.md.
 */

const LS_ENDPOINTS = 'overload.endpoints';
const LS_TOKEN = 'overload.token';
const LS_MODE = 'overload.mode';

export type Mode = 'connected' | 'local';

function read(key: string): string | null {
  if (!browser) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  if (!browser) return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage — ignore */
  }
}

export function getMode(): Mode {
  return (read(LS_MODE) as Mode) ?? 'connected';
}
export function setMode(mode: Mode) {
  write(LS_MODE, mode);
}

export function getToken(): string | null {
  return read(LS_TOKEN);
}
export function setToken(token: string | null) {
  write(LS_TOKEN, token);
}

/** Configured API base URLs, in preference order. Empty string = same-origin. */
export function getEndpoints(): string[] {
  const raw = read(LS_ENDPOINTS);
  if (raw) {
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    } catch {
      /* fall through */
    }
  }
  // Default to same-origin when the UI is served by the API itself.
  return [''];
}
export function setEndpoints(list: string[]) {
  write(LS_ENDPOINTS, JSON.stringify(list));
  activeBase = undefined;
}

let activeBase: string | null | undefined;

async function probe(base: string, timeoutMs = 2500): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/healthz`, { signal: ctrl.signal, credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Forget the cached API base so the next call re-probes. Call this when the
 * network may have changed (reconnect, tab refocus) — otherwise a base that
 * resolved to "unreachable" while the server was briefly down (e.g. a redeploy)
 * stays cached for the whole session even after the server returns.
 */
export function resetBase() {
  activeBase = undefined;
}

/** Resolve a reachable API base, probing candidates and caching the winner. */
export async function resolveBase(): Promise<string | null> {
  if (activeBase !== undefined) return activeBase;
  for (const base of getEndpoints()) {
    if (await probe(base)) {
      activeBase = base;
      return base;
    }
  }
  activeBase = null;
  return null;
}

/** Fetch against the active API base, attaching the bearer token if present. */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const base = (await resolveBase()) ?? '';
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${base}${path}`, { ...init, headers, credentials: 'include' });
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await api(path, init);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}
