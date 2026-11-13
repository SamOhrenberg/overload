import { recommendResistance } from './progression';
import { recommendCardio } from './cardio';
import { recommendRunZones } from './runZones';
import { recommendWorkCapacity } from './workCapacity';
import type { CardioPerf, GoalConfig, Recommendation, RunZonePerf, WorkingSet } from './types';

export type RecommendInput = {
  cfg: GoalConfig;
  lastSets?: WorkingSet[];
  lastCardio?: CardioPerf | null;
  lastRunZones?: RunZonePerf | null;
};

/**
 * Single entry point: route a goal to its progression rulebook. This is the
 * seam the whole engine hangs off — server and browser call this identically.
 */
export function buildRecommendation({
  cfg,
  lastSets,
  lastCardio,
  lastRunZones
}: RecommendInput): Recommendation {
  switch (cfg.goal) {
    case 'strength':
    case 'endurance':
      return recommendResistance(lastSets ?? [], cfg);
    case 'stamina':
      if (cfg.staminaMode === 'work_capacity') return recommendWorkCapacity(lastSets ?? [], cfg);
      if (cfg.tracksZones) return recommendRunZones(lastRunZones ?? null, cfg);
      return recommendCardio(lastCardio ?? null, cfg);
  }
}

export * from './types';
