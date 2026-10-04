import type { GoalConfig, Recommendation, WorkingSet } from './types';

/**
 * Muscular work-capacity progression (the non-cardio flavor of stamina).
 * Progresses density: build reps toward the top of a high-rep range, then add
 * total work (an extra set) or cut rest, rather than chasing load.
 */
export function recommendWorkCapacity(last: WorkingSet[], cfg: GoalConfig): Recommendation {
  const working = last.filter((s) => s.reps > 0);
  const repLow = cfg.repLow ?? 15;
  const repHigh = cfg.repHigh ?? 30;

  if (working.length === 0) {
    return {
      goal: 'stamina',
      target: { sets: cfg.targetSets, repLow, repHigh },
      rationale: 'No prior data — start in the high-rep range and build from there.',
      basis: { reason: 'cold-start' }
    };
  }

  const totalReps = working.reduce((n, s) => n + s.reps, 0);
  const minReps = Math.min(...working.map((s) => s.reps));
  const load = working.map((s) => s.weight).find((w) => w != null) ?? null;
  const basis = { totalReps, minReps, sets: working.length, repLow, repHigh };

  // All sets at the top of the range → add total work (another set) or cut rest.
  if (minReps >= repHigh) {
    return {
      goal: 'stamina',
      target: { sets: cfg.targetSets + 1, repLow, repHigh, weight: load },
      rationale: `Topping the rep range on every set — add a set to raise total work capacity.`,
      basis
    };
  }

  const next = Math.min(minReps + 3, repHigh);
  return {
    goal: 'stamina',
    target: { sets: cfg.targetSets, reps: next, repLow, repHigh, weight: load },
    rationale: `Build density: aim for ${next} reps per set, keeping rest short.`,
    basis
  };
}
