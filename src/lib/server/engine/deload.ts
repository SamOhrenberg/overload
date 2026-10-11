import { round } from './oneRepMax';
import type { Recommendation } from './types';

export type DeloadReason = 'stall' | 'accumulated-fatigue' | 'high-rpe-trend';

/**
 * Turn a recommendation into a deload: ~10% lighter and a touch more in
 * reserve, for a session or two, to shed fatigue before pushing again.
 * Returned as a suggestion the user accepts or declines — never forced.
 */
export function asDeload(rec: Recommendation, reason: DeloadReason): Recommendation {
  const target = { ...rec.target } as Record<string, unknown>;
  if (typeof target.weight === 'number') {
    target.weight = round((target.weight as number) * 0.9, 2.5);
  }
  if (typeof target.rir === 'number') {
    target.rir = (target.rir as number) + 1;
  }
  target.deload = true;

  const why: Record<DeloadReason, string> = {
    stall: 'progress has stalled',
    'accumulated-fatigue': 'several weeks of steady loading have built up',
    'high-rpe-trend': 'sessions are feeling harder while performance flattens'
  };

  return {
    ...rec,
    target,
    rationale: `Suggested deload — ${why[reason]}. Back off ~10% for a session or two, then resume.`,
    basis: { ...rec.basis, deloadReason: reason }
  };
}

/** Decide whether a deload is warranted from fatigue signals. */
export function shouldDeload(opts: {
  stalled: boolean;
  weeksLoading: number;
  rpeTrendRising: boolean;
}): DeloadReason | null {
  if (opts.stalled) return 'stall';
  if (opts.weeksLoading >= 5) return 'accumulated-fatigue';
  if (opts.rpeTrendRising) return 'high-rpe-trend';
  return null;
}
