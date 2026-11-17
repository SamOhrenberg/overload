/**
 * App-wide network activity, so a slow or stalled connection is visible
 * instead of taps silently doing nothing. `api()` reports every user-facing
 * request here; the ActivityBar in the root layout renders it.
 */

export const activity = $state({
  /** Requests currently in flight (background warm-up/sync excluded). */
  inflight: 0,
  /** Bumped each time a request fails to reach the server (network error or timeout). */
  failures: 0
});

/** Track a request for the duration of the promise. */
export async function track<T>(p: Promise<T>): Promise<T> {
  activity.inflight += 1;
  try {
    return await p;
  } catch (e) {
    activity.failures += 1;
    throw e;
  } finally {
    activity.inflight -= 1;
  }
}
