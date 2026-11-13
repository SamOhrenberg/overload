import type { RunSegment } from '$lib/server/db/schema';
import type { GoalConfig, Recommendation, RunZonePerf } from './types';

/** Ceiling on sprint reps before we lengthen the interval instead of adding one. */
const SPRINT_REP_CEILING = 6;
/** Floor we reset sprint reps to after lengthening the interval. */
const SPRINT_REP_FLOOR = 3;

const mmss = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}`;
const roundTo5 = (sec: number) => Math.round(sec / 5) * 5;

/**
 * Collapse a run's segments into the per-zone figures the engine progresses.
 * "Jog hold" is the longest single continuous jog; sprints are summarised as a
 * count and a representative (mean) interval length.
 */
export function zoneAggregates(segments: RunSegment[] | null | undefined): RunZonePerf {
  const seg = segments ?? [];
  const jog = seg.filter((s) => s.zone === 'jog');
  const sprint = seg.filter((s) => s.zone === 'sprint');
  const walk = seg.filter((s) => s.zone === 'walk');

  const sum = (xs: RunSegment[]) => xs.reduce((n, s) => n + (s.durationSec || 0), 0);
  const jogTotalSec = sum(jog);
  const sprintTotalSec = sum(sprint);

  return {
    jogHoldSec: jog.reduce((m, s) => Math.max(m, s.durationSec || 0), 0),
    jogTotalSec,
    sprintReps: sprint.length,
    sprintIntervalSec: sprint.length ? Math.round(sprintTotalSec / sprint.length) : 0,
    sprintTotalSec,
    walkTotalSec: sum(walk),
    totalSec: sum(seg)
  };
}

/**
 * Progress jog and sprint independently (see product spec):
 *   - Jog = a continuous base to extend  → grow the longest unbroken jog ~10%.
 *   - Sprint = interval work             → add a rep until a ceiling, then
 *     lengthen each interval and reset the rep count. One lever at a time.
 */
export function recommendRunZones(last: RunZonePerf | null, _cfg: GoalConfig): Recommendation {
  const hasJog = !!last && last.jogHoldSec > 0;
  const hasSprint = !!last && last.sprintReps > 0;

  if (!last || (!hasJog && !hasSprint)) {
    return {
      goal: 'stamina',
      target: { metric: 'run_zones', note: 'baseline' },
      rationale:
        'Log a run tapping Walk / Jog / Sprint as you go, so your jog and sprint baselines are set.',
      basis: { reason: 'cold-start' }
    };
  }

  // --- Jog base: extend the longest continuous jog, at least +15s. ---
  const nextJogHold = hasJog
    ? roundTo5(Math.max(last.jogHoldSec * 1.1, last.jogHoldSec + 15))
    : 60;
  const jogMsg = hasJog
    ? `Jog base: stretch your longest continuous jog to ${mmss(nextJogHold)} (was ${mmss(last.jogHoldSec)}).`
    : 'Jog base: settle into a continuous jog of about 1:00 to anchor the base.';

  // --- Sprint intervals: one lever at a time. ---
  let sprintIntervalSec: number;
  let sprintReps: number;
  let sprintMsg: string;

  if (!hasSprint) {
    sprintIntervalSec = 20;
    sprintReps = SPRINT_REP_FLOOR;
    sprintMsg = `Sprint: add ${SPRINT_REP_FLOOR} × ${mmss(20)} all-out intervals with walk recovery between.`;
  } else if (last.sprintReps < SPRINT_REP_CEILING) {
    sprintIntervalSec = last.sprintIntervalSec;
    sprintReps = last.sprintReps + 1;
    sprintMsg = `Sprint: add one interval → ${sprintReps} × ${mmss(sprintIntervalSec)} (was ${last.sprintReps} ×).`;
  } else {
    sprintIntervalSec = roundTo5(Math.max(last.sprintIntervalSec * 1.1, last.sprintIntervalSec + 5));
    sprintReps = SPRINT_REP_FLOOR;
    sprintMsg = `Sprint: lengthen each interval to ${mmss(sprintIntervalSec)}, resetting to ${SPRINT_REP_FLOOR} ×.`;
  }

  return {
    goal: 'stamina',
    target: {
      metric: 'run_zones',
      jog: { holdSec: nextJogHold },
      sprint: { intervalSec: sprintIntervalSec, reps: sprintReps }
    },
    rationale: `${jogMsg} ${sprintMsg}`,
    basis: {
      jogHoldSec: last.jogHoldSec,
      sprintIntervalSec: last.sprintIntervalSec,
      sprintReps: last.sprintReps
    }
  };
}
