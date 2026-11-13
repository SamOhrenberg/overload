import type { Goal, StaminaMode } from '$lib/server/db/schema';

export type { Goal, StaminaMode };

/** A single performed working set, as the engine reasons about it. */
export type WorkingSet = {
  weight: number | null;
  reps: number;
  rir: number | null;
};

/** A performed cardio bout. */
export type CardioPerf = {
  durationSec: number;
  distance: number | null;
  avgPaceSec: number | null;
  avgHr: number | null;
};

/** Per-zone summary of a run, used to progress jog and sprint separately. */
export type RunZonePerf = {
  /** Longest continuous jog (the jog-base lever). */
  jogHoldSec: number;
  jogTotalSec: number;
  /** Representative sprint interval length and how many were performed. */
  sprintIntervalSec: number;
  sprintReps: number;
  sprintTotalSec: number;
  walkTotalSec: number;
  totalSec: number;
};

/** The goal configuration for one exercise. */
export type GoalConfig = {
  goal: Goal;
  staminaMode?: StaminaMode | null;
  repLow: number | null;
  repHigh: number | null;
  targetSets: number;
  targetRir: number;
  loadIncrement: number | null;
  cardioMetric?: 'duration' | 'distance' | 'pace' | null;
  /** When set, a stamina/cardio exercise progresses Walk/Jog/Sprint zones. */
  tracksZones?: boolean;
};

/** Optional readiness, used to scale a recommendation up or down. */
export type Readiness = {
  sleep?: number;
  soreness?: number;
  stress?: number;
  energy?: number;
};

/** What the engine produces for one exercise. */
export type Recommendation = {
  goal: Goal;
  target: Record<string, unknown>;
  rationale: string;
  basis: Record<string, unknown>;
};
