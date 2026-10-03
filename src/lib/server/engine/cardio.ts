import type { CardioPerf, GoalConfig, Recommendation } from './types';

const paceStr = (sec: number | null) =>
  sec == null ? '—' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/**
 * Cardiovascular stamina progression. Volume increases are capped at ~10%
 * week-over-week, and only one lever (volume OR intensity) moves at a time.
 */
export function recommendCardio(last: CardioPerf | null, cfg: GoalConfig): Recommendation {
  const metric = cfg.cardioMetric ?? 'distance';

  if (!last) {
    return {
      goal: 'stamina',
      target: { metric, note: 'baseline' },
      rationale: 'Log a first session at a comfortable effort to set your baseline.',
      basis: { reason: 'cold-start' }
    };
  }

  const basis = {
    durationSec: last.durationSec,
    distance: last.distance,
    avgPaceSec: last.avgPaceSec,
    avgHr: last.avgHr
  };

  // Progress volume (distance/duration), capped at +10%, holding easy pace.
  if (metric === 'distance' && last.distance) {
    const next = Math.round(last.distance * 1.1 * 10) / 10;
    return {
      goal: 'stamina',
      target: { metric, distance: next, holdPaceSec: last.avgPaceSec },
      rationale:
        `Within the 10% cap → target ${next} at the same easy pace (${paceStr(last.avgPaceSec)})` +
        (last.avgHr ? `; keep average HR near ${last.avgHr}.` : '.'),
      basis
    };
  }

  if (metric === 'duration') {
    const next = Math.round((last.durationSec * 1.1) / 60);
    return {
      goal: 'stamina',
      target: { metric, durationSec: next * 60, holdPaceSec: last.avgPaceSec },
      rationale: `Add time within the 10% cap → about ${next} min at the same effort.`,
      basis
    };
  }

  // Intensity progression: hold distance, nudge pace ~2% faster.
  if (last.avgPaceSec) {
    const faster = Math.round(last.avgPaceSec * 0.98);
    return {
      goal: 'stamina',
      target: { metric: 'pace', distance: last.distance, targetPaceSec: faster },
      rationale: `Hold the distance and pick up the pace slightly → ${paceStr(faster)}/unit.`,
      basis
    };
  }

  return {
    goal: 'stamina',
    target: { metric, repeat: true },
    rationale: 'Repeat last session and log pace and heart rate so progress can be measured.',
    basis
  };
}
