import type { Readiness, Recommendation } from './types';

/**
 * Collapse a readiness check-in into a single score in [-1, 1].
 * Each sub-score is entered 1 (poor) .. 5 (great); soreness/stress are inverted.
 */
export function readinessScore(r: Readiness): number {
  const parts: number[] = [];
  if (r.sleep != null) parts.push(r.sleep);
  if (r.energy != null) parts.push(r.energy);
  if (r.soreness != null) parts.push(6 - r.soreness);
  if (r.stress != null) parts.push(6 - r.stress);
  if (parts.length === 0) return 0;
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length; // 1..5
  return (avg - 3) / 2; // -1..1
}

/**
 * Scale a recommendation by today's readiness. Poor readiness softens the
 * target (hold load, leave an extra rep); great readiness green-lights a push.
 */
export function applyReadiness(rec: Recommendation, r: Readiness): Recommendation {
  const score = readinessScore(r);
  if (score <= -0.5) {
    const target = { ...rec.target } as Record<string, unknown>;
    if (typeof target.rir === 'number') target.rir = (target.rir as number) + 1;
    return {
      ...rec,
      target,
      rationale: `${rec.rationale} Readiness is low today — hold back and leave an extra rep in reserve.`,
      basis: { ...rec.basis, readinessScore: score }
    };
  }
  if (score >= 0.6) {
    return {
      ...rec,
      rationale: `${rec.rationale} You're fresh — a good day to push for the top end or a PR attempt.`,
      basis: { ...rec.basis, readinessScore: score }
    };
  }
  return { ...rec, basis: { ...rec.basis, readinessScore: score } };
}
