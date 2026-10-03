import { round } from './oneRepMax';
import type { GoalConfig, Recommendation, WorkingSet } from './types';

/**
 * Double progression + RIR autoregulation for resistance work (strength and
 * muscular endurance). Pure function over the last session's working sets.
 *
 * See docs/04-progression-engine.md for the rulebook this implements.
 */
export function recommendResistance(last: WorkingSet[], cfg: GoalConfig): Recommendation {
  const working = last.filter((s) => s.reps > 0);
  const repLow = cfg.repLow ?? 5;
  const repHigh = cfg.repHigh ?? 8;

  if (working.length === 0) {
    return {
      goal: cfg.goal,
      target: { sets: cfg.targetSets, repLow, repHigh, weight: null, rir: cfg.targetRir },
      rationale: 'No prior data yet — log a session and targets will adapt from your results.',
      basis: { reason: 'cold-start' }
    };
  }

  // Primary working load = the heaviest non-warmup load used.
  const weights = working.map((s) => s.weight).filter((w): w is number => w != null);
  const load = weights.length ? Math.max(...weights) : null;
  const increment = cfg.loadIncrement ?? 5;

  const hitTopAll = working.every((s) => s.reps >= repHigh);
  const minReps = Math.min(...working.map((s) => s.reps));
  const rirValues = working.map((s) => s.rir).filter((r): r is number => r != null);
  const minRir = rirValues.length ? Math.min(...rirValues) : null;
  const hadGasLeft = minRir == null ? true : minRir >= cfg.targetRir;
  const basis = { load, hitTopAll, minReps, minRir, repLow, repHigh };

  // Bodyweight / unloaded: progress by reps, not load.
  if (load == null) {
    const next = Math.min(minReps + 2, repHigh + (hitTopAll ? 3 : 0));
    return {
      goal: cfg.goal,
      target: { sets: cfg.targetSets, reps: next, weight: null, rir: cfg.targetRir },
      rationale: hitTopAll
        ? `Strong set last time — push for ${next} reps and consider adding load.`
        : `Add reps: aim for ${next} next time.`,
      basis
    };
  }

  // 1) Earned the jump: top of range on all sets, with reps in reserve.
  if (hitTopAll && hadGasLeft) {
    const weight = round(load + increment, increment);
    return {
      goal: cfg.goal,
      target: { sets: cfg.targetSets, repLow, repHigh, weight, rir: cfg.targetRir },
      rationale:
        `You hit all sets at the top of the range` +
        (minRir != null ? ` with ${minRir} in reserve` : '') +
        ` → add ${increment} to ${weight}, reset to ${repLow}–${repHigh} reps.`,
      basis
    };
  }

  // 2) Hit the top but it was grindy (no reserve): consolidate at the same load.
  if (hitTopAll && !hadGasLeft) {
    return {
      goal: cfg.goal,
      target: { sets: cfg.targetSets, repLow, repHigh, weight: load, rir: cfg.targetRir },
      rationale: `Top of the range but little left in reserve — hold ${load} and aim for cleaner reps before adding load.`,
      basis
    };
  }

  // 3) Inside the range: classic rep progression at the same load.
  if (minReps >= repLow) {
    const next = Math.min(minReps + (hadGasLeft ? 2 : 1), repHigh);
    return {
      goal: cfg.goal,
      target: { sets: cfg.targetSets, reps: next, repLow, repHigh, weight: load, rir: cfg.targetRir },
      rationale: `Keep ${load} and build to ${next} reps across your sets.`,
      basis
    };
  }

  // 4) Below the range or to failure: back off to rebuild.
  const weight = round(load * 0.9, increment);
  return {
    goal: cfg.goal,
    target: { sets: cfg.targetSets, repLow, repHigh, weight, rir: Math.max(cfg.targetRir, 2) },
    rationale: `Reps fell below the range — drop to ${weight} and rebuild with a couple of reps in reserve.`,
    basis
  };
}
