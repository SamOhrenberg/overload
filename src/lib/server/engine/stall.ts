/**
 * Plateau detection over a chronological progress series (e.g. estimated 1RM
 * or top-set load, oldest → newest). A lift is "stalled" when it has set no new
 * best within the lookback window despite enough sessions to judge.
 */
export type StallResult = {
  stalled: boolean;
  sessionsSinceBest: number;
  suggestion: string | null;
};

export function detectStall(series: number[], lookback = 3): StallResult {
  const clean = series.filter((n) => Number.isFinite(n) && n > 0);
  if (clean.length < lookback + 1) {
    return { stalled: false, sessionsSinceBest: 0, suggestion: null };
  }

  const best = Math.max(...clean);
  const bestIndex = clean.lastIndexOf(best);
  const sessionsSinceBest = clean.length - 1 - bestIndex;

  if (sessionsSinceBest >= lookback) {
    return {
      stalled: true,
      sessionsSinceBest,
      suggestion:
        `No new best in ${sessionsSinceBest} sessions. Consider a deload, a rep-range change, ` +
        `or swapping to a close variation to break the plateau.`
    };
  }

  return { stalled: false, sessionsSinceBest, suggestion: null };
}
