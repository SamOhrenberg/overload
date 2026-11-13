import { browser } from '$app/environment';
import { api, resetBase } from './api';

/**
 * Offline write outbox. Set logging never blocks on the network: writes are
 * queued in IndexedDB and replayed when connectivity returns, so a set logged
 * between racks on dead gym Wi-Fi is never lost. See docs/01-architecture.md.
 */

type Queued = { id: string; path: string; method: string; body: string };
const DB = 'overload-outbox';
const STORE = 'queue';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const store = db.transaction(STORE, mode).objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

async function all(): Promise<Queued[]> {
  return tx<Queued[]>('readonly', (s) => s.getAll());
}
async function put(item: Queued) {
  await tx('readwrite', (s) => s.put(item));
}
async function remove(id: string) {
  await tx('readwrite', (s) => s.delete(id));
}

/**
 * `crypto.randomUUID` only exists in secure contexts (HTTPS or localhost). Over
 * plain-HTTP LAN access it is undefined and throwing here would abort the write
 * before it was ever sent or queued, so fall back to getRandomValues (available
 * everywhere) and finally Math.random.
 */
function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Try to deliver now; on any failure, queue for later replay. Resolves to true
 * when the write reached the server, false when it was queued.
 *
 * We deliberately do NOT consult `navigator.onLine` here: it is unreliable
 * (notably in iOS/Safari PWAs and over LAN/self-signed TLS, where it can read
 * `false` while the network is perfectly fine), and trusting it caused every
 * write to be parked offline and never sent. Attempting the request is cheap —
 * if we are genuinely offline the fetch rejects quickly and we queue anyway.
 */
export async function send(path: string, body: unknown, method = 'POST'): Promise<boolean> {
  const item: Queued = {
    id: newId(),
    path,
    method,
    body: JSON.stringify(body)
  };
  if (!browser) return false;
  try {
    const res = await api(path, { method, body: item.body });
    if (res.ok) return true; // delivered
  } catch {
    /* network error — fall through to queue */
  }
  await put(item).catch(() => {});
  return false; // queued for retry
}

export type OutboxItem = Queued;

/** Snapshot of everything currently queued (for the pending-sync UI). */
export async function peek(): Promise<OutboxItem[]> {
  if (!browser) return [];
  try {
    return await all();
  } catch {
    return [];
  }
}

/** How many writes are waiting to sync. */
export async function pendingCount(): Promise<number> {
  return (await peek()).length;
}

/** Permanently drop one queued write (e.g. a poisoned item the user discards). */
export async function discard(id: string): Promise<void> {
  await remove(id).catch(() => {});
}

export type RetryResult = { id: string; path: string; ok: boolean; status?: number; error?: string };

/**
 * Replay the queue, returning a per-item result so the UI can show exactly what
 * happened (status code or network error) instead of failing silently.
 */
export async function retry(): Promise<RetryResult[]> {
  const out: RetryResult[] = [];
  if (!browser) return out;
  resetBase();
  let items: Queued[] = [];
  try {
    items = await all();
  } catch (e) {
    return [{ id: '-', path: '(indexeddb)', ok: false, error: String(e) }];
  }
  for (const item of items) {
    try {
      const res = await api(item.path, { method: item.method, body: item.body });
      // Only a confirmed success removes a write. A rejection (even a 4xx such
      // as an expired session) KEEPS it queued and visible so it is never lost —
      // the user decides whether to discard it.
      if (res.ok) await remove(item.id);
      out.push({ id: item.id, path: item.path, ok: res.ok, status: res.status });
    } catch (e) {
      out.push({ id: item.id, path: item.path, ok: false, error: String(e) });
    }
  }
  return out;
}

/** Replay everything queued. Called on reconnect, refocus, and on app start. */
export async function flush(): Promise<void> {
  // Don't gate on navigator.onLine — it can falsely read `false` (iOS/PWA, LAN
  // TLS) and would then never replay the queue. Just attempt; a genuinely
  // offline request rejects and we stop until the next trigger.
  if (!browser) return;
  let items: Queued[] = [];
  try {
    items = await all();
  } catch {
    return;
  }
  if (!items.length) return;
  // The server may have come back on a different/recovered base (e.g. after a
  // redeploy), so forget any cached "unreachable" result and re-probe.
  resetBase();
  for (const item of items) {
    try {
      const res = await api(item.path, { method: item.method, body: item.body });
      if (res.ok) {
        await remove(item.id); // delivered — safe to drop
      } else if (res.status >= 500 || res.status === 408 || res.status === 429) {
        break; // server having trouble — stop and retry the whole queue later
      }
      // Any other non-OK (e.g. a 401 from an expired session) is KEPT queued and
      // left visible in the Pending-sync view. An unsent write is never discarded
      // automatically — only the user may discard it.
    } catch {
      break; // genuinely offline / server unreachable — retry later
    }
  }
}

export function startOutbox() {
  if (!browser) return;
  // navigator.onLine only flips when the *device* loses its network, not when
  // the server is briefly unreachable (a redeploy). So retry on several signals.
  window.addEventListener('online', () => void flush());
  window.addEventListener('focus', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush();
  });
  void flush();
}
