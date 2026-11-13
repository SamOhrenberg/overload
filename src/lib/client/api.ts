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

/**
 * True for the standalone static build (GitHub Pages): there is no API on the
 * UI's own origin, so the user must configure one on first launch.
 */
export const STANDALONE: boolean = __STANDALONE__;

/** Configured API base URLs, in preference order. Empty string = same-origin. */
export function getEndpoints(): string[] {
  const raw = read(LS_ENDPOINTS);
  if (raw) {
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length) return list;
    } catch {
      /* fall through */
    }
  }
  // Served by the API itself → same-origin. Standalone → nothing until set up.
  return STANDALONE ? [] : [''];
}
export function setEndpoints(list: string[]) {
  write(LS_ENDPOINTS, list.length ? JSON.stringify(list) : null);
  activeBase = undefined;
}

/** First launch of the standalone UI: no API configured yet. */
export function needsSetup(): boolean {
  return getEndpoints().length === 0;
}

/**
 * Tidy what the user typed into a base URL: add a scheme (http:// for bare
 * IPs/hostnames), drop trailing slashes and any path. Returns null if invalid.
 */
export function normalizeEndpoint(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** Private/LAN hosts (RFC 1918, link-local, .local, localhost). */
function isLocalHost(base: string): boolean {
  try {
    const h = new URL(base).hostname;
    return (
      h === 'localhost' ||
      h.endsWith('.local') ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^169\.254\./.test(h)
    );
  } catch {
    return false;
  }
}

/**
 * Chrome's Local Network Access lets an HTTPS page (e.g. GitHub Pages) call an
 * http:// LAN address after a permission prompt, but only when the request
 * declares it targets the local network. Other browsers ignore the option.
 */
function fetchInit(base: string, init: RequestInit): RequestInit {
  if (base && isLocalHost(base)) {
    return { ...init, targetAddressSpace: 'local' } as RequestInit;
  }
  return init;
}

/** Would the browser block this endpoint as mixed content (HTTPS page → http API)? */
export function isMixedContent(base: string): boolean {
  if (typeof location === 'undefined' || location.protocol !== 'https:') return false;
  return base.startsWith('http:') && !isLocalHost(base);
}

let activeBase: string | null | undefined;

export async function probe(base: string, timeoutMs = 2500): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${base}/healthz`,
      fetchInit(base, { signal: ctrl.signal, credentials: 'include', cache: 'no-store' })
    );
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
  // Nothing answered (offline / server down): still aim at the preferred
  // endpoint so the request fails fast — or the service worker can answer it
  // from its cache — instead of hitting the UI's own origin.
  const base = (await resolveBase()) ?? getEndpoints()[0] ?? '';
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${base}${path}`, fetchInit(base, { ...init, headers, credentials: 'include' }));
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await api(path, init);
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Best-effort human message from an error response ({ error } or { message }). */
export async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === 'string') return body.error;
    if (typeof body?.message === 'string') return body.message;
  } catch {
    /* not JSON */
  }
  return `Request failed: ${res.status}`;
}
