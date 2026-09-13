/**
 * Estimated one-rep max. Pure functions, no I/O — so the same code runs on
 * the server and in the browser (local-only mode).
 */

/** Epley formula. Returns the input weight unchanged for a true 1-rep set. */
export function epley1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

/** Round to a plausible plate-load increment. */
export function round(value: number, increment = 2.5): number {
  return Math.round(value / increment) * increment;
}

/** Estimate the load for a target rep count from a known 1RM (inverse Epley). */
export function loadForReps(oneRm: number, reps: number): number {
  if (reps <= 1) return oneRm;
  return oneRm / (1 + reps / 30);
}

/** Best estimated 1RM across a set of working sets. */
export function bestEstimated1RM(
  sets: Array<{ weight: number | null; reps: number; isWarmup?: boolean }>
): number {
  let best = 0;
  for (const s of sets) {
    if (s.isWarmup || s.weight == null) continue;
    best = Math.max(best, epley1RM(s.weight, s.reps));
  }
  return best;
}
