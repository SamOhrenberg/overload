/**
 * Minimal in-memory fixed-window rate limiter. Good enough for a self-hosted
 * single-instance deployment; swap for a shared store if ever scaled out.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

// Occasionally evict expired buckets so the map can't grow unbounded.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}, 60_000);
// Don't keep the process alive just for the sweeper (Node only).
(sweeper as { unref?: () => void }).unref?.();
