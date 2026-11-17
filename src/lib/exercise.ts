/**
 * Exercise rules shared by the UI and the server: which exercises take a
 * weight, their default load step, and each goal's default prescription.
 */
export type Goal = 'strength' | 'endurance' | 'stamina';
export type StaminaMode = 'cardio' | 'work_capacity';
export type Modality = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cardio';
export type ExerciseKind = 'resistance' | 'cardio' | 'mobility';
export type ExerciseUnit = 'lb' | 'kg' | 'km' | 'mi' | 'min';

export const MODALITIES: Modality[] = ['barbell', 'dumbbell', 'machine', 'bodyweight', 'cardio'];
export const KINDS: ExerciseKind[] = ['resistance', 'cardio', 'mobility'];
export const UNITS: ExerciseUnit[] = ['lb', 'kg', 'km', 'mi', 'min'];
export const GOALS: Goal[] = ['strength', 'endurance', 'stamina'];
export const STAMINA_MODES: StaminaMode[] = ['cardio', 'work_capacity'];
export const CARDIO_METRICS = ['duration', 'distance', 'pace'] as const;

/** Modalities whose sets are logged with a weight. */
export const LOADED_MODALITIES: Modality[] = ['barbell', 'dumbbell', 'machine'];

/** True when sets of this exercise are logged with a weight. */
export function tracksWeight(ex: { modality: string; kind?: string | null }): boolean {
  return ex.kind !== 'cardio' && LOADED_MODALITIES.includes(ex.modality as Modality);
}

/** The load step used when an exercise doesn't set one: 5 lb or 2.5 kg. */
export function defaultLoadIncrement(unit: string): number {
  return unit === 'kg' ? 2.5 : 5;
}

/** Effective load step for an exercise (its own, else the unit default). */
export function loadStep(ex: { unit: string; loadIncrement: string | number | null }): number {
  const n = ex.loadIncrement != null ? Number(ex.loadIncrement) : NaN;
  return n > 0 ? n : defaultLoadIncrement(ex.unit);
}

/** A typed-in load step, or null when blank/invalid (the server then uses the default). */
export function parseLoadStep(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "Chest, triceps" → ["chest", "triceps"]. */
export function parseMuscles(s: string): string[] {
  return [...new Set(s.split(',').map((m) => m.trim().toLowerCase()).filter(Boolean))];
}

/** Units that make sense for a modality (cardio is distance/time, else load). */
export function unitsFor(modality: string): ExerciseUnit[] {
  if (modality === 'cardio') return ['mi', 'km', 'min'];
  if (modality === 'bodyweight') return ['lb', 'kg', 'min'];
  return ['lb', 'kg'];
}

/** Sensible defaults for each goal, used when a user first tags an exercise. */
export function goalDefaults(goal: Goal, staminaMode: StaminaMode = 'cardio') {
  switch (goal) {
    case 'strength':
      return { repLow: 3, repHigh: 6, targetSets: 3, targetRir: 2, staminaMode: null };
    case 'endurance':
      return { repLow: 12, repHigh: 20, targetSets: 3, targetRir: 1, staminaMode: null };
    case 'stamina':
      return staminaMode === 'work_capacity'
        ? { repLow: 15, repHigh: 30, targetSets: 3, targetRir: 1, staminaMode }
        : { repLow: null, repHigh: null, targetSets: 1, targetRir: 0, staminaMode };
  }
}
