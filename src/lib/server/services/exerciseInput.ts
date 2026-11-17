/**
 * Validation for exercise and goal input, shared by the app API
 * (/api/exercises/*) and the MCP tools so both accept exactly the same thing.
 * Errors are ToolErrors; API routes turn them into 400s.
 */
import { ArgReader, ToolError, nullable } from '$lib/server/mcp/args';
import {
  CARDIO_METRICS,
  GOALS,
  KINDS,
  MODALITIES,
  STAMINA_MODES,
  UNITS
} from '$lib/exercise';
import type { ExerciseInput, ExercisePatch } from './exercises';

export const EXERCISE_FIELDS = {
  name: { type: 'string', minLength: 1, maxLength: 80 },
  modality: { type: 'string', enum: MODALITIES },
  kind: { type: 'string', enum: KINDS, description: 'Default follows modality: cardio for cardio, else resistance.' },
  muscleGroups: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 40 }, description: 'e.g. ["chest","triceps"].' },
  unit: { type: 'string', enum: UNITS, description: 'lb/kg for weights; mi/km/min for cardio.' },
  loadIncrement: nullable({
    type: 'number',
    minimum: 0,
    description:
      'Smallest weight jump (e.g. 5 lb, 2.5 kg). Barbell, dumbbell and machine exercises are always logged with a weight; if omitted/null their step defaults to 5 lb or 2.5 kg. Bodyweight and cardio exercises have no weight field.'
  }),
  defaultGoal: nullable({ type: 'string', enum: GOALS }),
  tracksSpeedZones: { type: 'boolean', description: 'Cardio logged as walk/jog/sprint segments.' }
};

function readStrings(r: ArgReader, key: string): string[] | undefined {
  const a = r.arr(key, { max: 12 });
  if (a == null) return undefined;
  return [
    ...new Set(
      a.map((v, i) => {
        if (typeof v !== 'string' || !v.trim() || v.length > 40) {
          throw new ToolError(`"${key}[${i}]" must be a short non-empty string.`);
        }
        return v.trim().toLowerCase();
      })
    )
  ];
}

function readFields(r: ArgReader) {
  const name = r.str('name', { max: 80 });
  if (name === '') throw new ToolError('"name" must not be empty.');
  return {
    name: name ?? undefined,
    modality: r.oneOf('modality', MODALITIES) ?? undefined,
    kind: r.oneOf('kind', KINDS) ?? undefined,
    muscleGroups: readStrings(r, 'muscleGroups'),
    unit: r.oneOf('unit', UNITS) ?? undefined,
    loadIncrement: r.num('loadIncrement', { min: 0, max: 100, nullable: true }),
    defaultGoal: r.oneOf('defaultGoal', GOALS, { nullable: true }),
    tracksSpeedZones: r.bool('tracksSpeedZones') ?? undefined
  };
}

export function readNewExercise(r: ArgReader): ExerciseInput {
  r.only(...Object.keys(EXERCISE_FIELDS));
  r.str('name', { required: true });
  r.oneOf('modality', MODALITIES, { required: true });
  const f = readFields(r);
  return { ...f, name: f.name!, modality: f.modality! };
}

/** Only the given keys are set; `archived` maps to isArchived. */
export function readExercisePatch(r: ArgReader, extraKeys: string[] = []): ExercisePatch {
  r.only(...Object.keys(EXERCISE_FIELDS), 'archived', ...extraKeys);
  const f = readFields(r);
  const patch: ExercisePatch = Object.fromEntries(
    Object.entries({ ...f, isArchived: r.bool('archived') ?? undefined }).filter(([, v]) => v !== undefined)
  );
  if (!Object.keys(patch).length) throw new ToolError('Nothing to update.');
  return patch;
}

export const GOAL_FIELDS = {
  goal: { type: 'string', enum: GOALS },
  staminaMode: {
    type: 'string',
    enum: STAMINA_MODES,
    description: 'Stamina only: cardio (distance/time/pace) or work_capacity (high-rep sets).'
  },
  repLow: { type: 'integer', minimum: 1, maximum: 100 },
  repHigh: { type: 'integer', minimum: 1, maximum: 100 },
  targetSets: { type: 'integer', minimum: 1, maximum: 20 },
  targetRir: { type: 'integer', minimum: 0, maximum: 10, description: 'Reps in reserve to aim for.' },
  cardioMetric: { type: 'string', enum: CARDIO_METRICS, description: 'Stamina cardio: what to progress.' }
};

export function readGoal(r: ArgReader, extraKeys: string[] = []) {
  r.only(...Object.keys(GOAL_FIELDS), ...extraKeys);
  const goal = r.oneOf('goal', GOALS, { required: true })!;
  const opts = Object.fromEntries(
    Object.entries({
      staminaMode: r.oneOf('staminaMode', STAMINA_MODES) ?? undefined,
      repLow: r.int('repLow', { min: 1, max: 100, nullable: true }) ?? undefined,
      repHigh: r.int('repHigh', { min: 1, max: 100, nullable: true }) ?? undefined,
      targetSets: r.int('targetSets', { min: 1, max: 20 }) ?? undefined,
      targetRir: r.int('targetRir', { min: 0, max: 10 }) ?? undefined,
      cardioMetric: r.oneOf('cardioMetric', CARDIO_METRICS) ?? undefined
    }).filter(([, v]) => v !== undefined)
  ) as {
    staminaMode?: 'cardio' | 'work_capacity';
    repLow?: number;
    repHigh?: number;
    targetSets?: number;
    targetRir?: number;
    cardioMetric?: 'duration' | 'distance' | 'pace';
  };
  if (opts.staminaMode && goal !== 'stamina') throw new ToolError('"staminaMode" only applies to the stamina goal.');
  if ((opts.repLow == null) !== (opts.repHigh == null)) {
    throw new ToolError('Give both "repLow" and "repHigh", or neither.');
  }
  if (opts.repLow != null && opts.repHigh != null && opts.repLow > opts.repHigh) {
    throw new ToolError('"repLow" must not exceed "repHigh".');
  }
  return { goal, opts };
}
