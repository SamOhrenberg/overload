import { recommendResistance } from './progression';
import { recommendCardio } from './cardio';
import { recommendWorkCapacity } from './workCapacity';
import type { CardioPerf, GoalConfig, Recommendation, WorkingSet } from './types';

export type RecommendInput = {
  cfg: GoalConfig;
  lastSets?: WorkingSet[];
  lastCardio?: CardioPerf | null;
};

/**
 * Single entry point: route a goal to its progression rulebook. This is the
 * seam the whole engine hangs off — server and browser call this identically.
 */
export function buildRecommendation({ cfg, lastSets, lastCardio }: RecommendInput): Recommendation {
  switch (cfg.goal) {
    case 'strength':
    case 'endurance':
      return recommendResistance(lastSets ?? [], cfg);
    case 'stamina':
      return cfg.staminaMode === 'work_capacity'
        ? recommendWorkCapacity(lastSets ?? [], cfg)
        : recommendCardio(lastCardio ?? null, cfg);
  }
}

export * from './types';
