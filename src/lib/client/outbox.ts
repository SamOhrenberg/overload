import { browser } from '$app/environment';
import { api } from './api';

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

/** Send now if possible; otherwise queue and resolve immediately (optimistic). */
export async function send(path: string, body: unknown, method = 'POST'): Promise<void> {
  const item: Queued = {
    id: crypto.randomUUID(),
    path,
    method,
    body: JSON.stringify(body)
  };
  if (!browser || !navigator.onLine) {
    await put(item).catch(() => {});
    return;
  }
  try {
    const res = await api(path, { method, body: item.body });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    await put(item).catch(() => {});
  }
}

/** Replay everything queued. Called on reconnect and on app start. */
export async function flush(): Promise<void> {
  if (!browser || !navigator.onLine) return;
  let items: Queued[] = [];
  try {
    items = await all();
  } catch {
    return;
  }
  for (const item of items) {
    try {
      const res = await api(item.path, { method: item.method, body: item.body });
      if (res.ok) await remove(item.id);
    } catch {
      break; // still offline — stop and try again later
    }
  }
}

export function startOutbox() {
  if (!browser) return;
  window.addEventListener('online', () => void flush());
  void flush();
}
