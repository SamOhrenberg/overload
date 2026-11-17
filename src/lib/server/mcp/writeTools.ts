/**
 * MCP write tools (scope "write"): create, change and delete the user's
 * workouts, sets, cardio, exercises, goals, routines, schedule and targets.
 *
 * Every id that comes in is re-checked against the token's user before any
 * write — a tool can never touch another user's rows or edit the built-in
 * exercise library. Multi-row writes run in one transaction. When a finished
 * workout changes, PR detection and the next-session targets are refreshed,
 * the same as finishing a workout in the app.
 */
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  users,
  workouts,
  workoutExercises,
  exercises,
  sets,
  cardioBouts,
  recommendations,
  exerciseGroups,
  comments,
  type Goal
} from '$lib/server/db/schema';
import { GROUP_COLORS } from '$lib/format';
import { getWorkoutDetail } from '$lib/server/services/workouts';
import {
  createExercise,
  deleteExercise,
  findExerciseByName,
  updateExercise
} from '$lib/server/services/exercises';
import {
  EXERCISE_FIELDS,
  GOAL_FIELDS,
  readExercisePatch,
  readGoal,
  readNewExercise
} from '$lib/server/services/exerciseInput';
import { tracksWeight } from '$lib/exercise';
import { cardioRow, type CardioInput } from '$lib/server/services/cardio';
import { clearGoal, getActiveGoal, setGoal } from '$lib/server/services/goals';
import { detectPrsForWorkout } from '$lib/server/services/prs';
import {
  generateForExercise,
  getRecommendationsForPrefill,
  setRecommendationStatus,
  updateRecommendationTarget
} from '$lib/server/services/recommendations';
import {
  createGroup,
  deleteGroup,
  updateGroup,
  setGroupMembers,
  getGroupMemberIds,
  getWeeklySchedule,
  setDaySchedule,
  setDayPlan,
  resolveActiveGroups
} from '$lib/server/services/routines';
import { ArgReader, ToolError, defined, nullable, obj, uuidProp, type Tool } from './args';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ExerciseRow = typeof exercises.$inferSelect;

const GOALS = ['strength', 'endurance', 'stamina'] as const;
const ZONES = ['walk', 'jog', 'sprint'] as const;
const COLORS = GROUP_COLORS.map((c) => c.key);
const WEEKDAYS = 'Weekday 0–6, 0 = Sunday.';

// ---------------------------------------------------------------------------
// Ownership checks
// ---------------------------------------------------------------------------

async function ownedWorkout(userId: string, id: string) {
  const [w] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, id), eq(workouts.userId, userId)));
  if (!w) throw new ToolError('Workout not found.');
  return w;
}

/** A workout-exercise entry (the per-workout row sets hang off) owned by the user. */
async function ownedEntry(userId: string, id: string) {
  const [r] = await db
    .select({ entry: workoutExercises, workout: workouts, exercise: exercises })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(and(eq(workoutExercises.id, id), eq(workouts.userId, userId)));
  if (!r) {
    throw new ToolError(
      'Workout exercise not found. Use an entry "id" from get_workout (not the exerciseId).'
    );
  }
  return r;
}

async function ownedSet(userId: string, id: string) {
  const [r] = await db
    .select({ set: sets, entry: workoutExercises, workout: workouts })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(eq(sets.id, id), eq(workouts.userId, userId)));
  if (!r) throw new ToolError('Set not found.');
  return r;
}

async function ownedBout(userId: string, id: string) {
  const [r] = await db
    .select({ bout: cardioBouts, entry: workoutExercises, workout: workouts })
    .from(cardioBouts)
    .innerJoin(workoutExercises, eq(cardioBouts.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(eq(cardioBouts.id, id), eq(workouts.userId, userId)));
  if (!r) throw new ToolError('Cardio bout not found.');
  return r;
}

/** A built-in or own exercise the user can log / plan with. */
async function visibleExercise(userId: string, id: string): Promise<ExerciseRow> {
  const [e] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), or(isNull(exercises.ownerId), eq(exercises.ownerId, userId))));
  if (!e) throw new ToolError(`Exercise ${id} not found. Use an id from list_exercises.`);
  return e;
}

/** An exercise the user created (the built-in library is read-only). */
async function customExercise(userId: string, id: string): Promise<ExerciseRow> {
  const e = await visibleExercise(userId, id);
  if (e.ownerId == null) {
    throw new ToolError(
      `"${e.name}" is a built-in exercise and can't be changed. Create a custom exercise instead.`
    );
  }
  return e;
}

async function assertExercisesUsable(userId: string, ids: string[]) {
  if (!ids.length) return;
  const rows = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        inArray(exercises.id, ids),
        or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)),
        eq(exercises.isArchived, false)
      )
    );
  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw new ToolError(`Unknown or archived exercise id(s): ${missing.join(', ')}.`);
}

async function assertGroupsOwned(userId: string, ids: string[]) {
  if (!ids.length) return;
  const rows = await db
    .select({ id: exerciseGroups.id })
    .from(exerciseGroups)
    .where(and(eq(exerciseGroups.userId, userId), inArray(exerciseGroups.id, ids)));
  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw new ToolError(`Unknown routine id(s): ${missing.join(', ')}. See get_routines.`);
}

async function effectiveGoal(userId: string, ex: ExerciseRow): Promise<Goal> {
  return (await getActiveGoal(userId, ex.id))?.goal ?? ex.defaultGoal ?? 'strength';
}

/**
 * After a finished workout changes: record any new PRs and recompute the
 * next-session targets for the touched exercises. In-progress workouts are
 * left alone (the app does this when they are finished).
 */
async function refreshAfterChange(
  userId: string,
  workout: { id: string; endedAt: Date | null },
  exerciseIds: string[]
) {
  if (!workout.endedAt) return { newPersonalRecords: [] as Awaited<ReturnType<typeof detectPrsForWorkout>> };
  const newPersonalRecords = await detectPrsForWorkout(userId, workout.id);
  await regenerate(userId, exerciseIds);
  return { newPersonalRecords };
}

async function regenerate(userId: string, exerciseIds: string[]) {
  for (const id of new Set(exerciseIds)) await generateForExercise(userId, id);
}

// ---------------------------------------------------------------------------
// Input parsing (sets, cardio, workout entries, readiness)
// ---------------------------------------------------------------------------

const setProps = {
  weight: nullable({ type: 'number', minimum: 0, description: "Load in the exercise's unit. Omit/null for bodyweight." }),
  reps: { type: 'integer', minimum: 0, maximum: 1000 },
  rir: nullable({ type: 'integer', minimum: 0, maximum: 10, description: 'Reps in reserve.' }),
  rpe: nullable({ type: 'number', minimum: 1, maximum: 10 }),
  isWarmup: { type: 'boolean', description: 'Default false. Warm-ups are ignored by PRs and progression.' },
  restSec: nullable({ type: 'integer', minimum: 0, maximum: 3600, description: 'Rest after the set.' }),
  tempo: nullable({ type: 'string', maxLength: 20, description: 'e.g. "3-1-1-0".' })
};
const setSchema = obj(setProps, ['reps']);

function readSet(r: ArgReader) {
  r.only(...Object.keys(setProps));
  return {
    weight: r.num('weight', { min: 0, max: 5000, nullable: true }) ?? null,
    reps: r.int('reps', { required: true, min: 0, max: 1000 })!,
    rir: r.int('rir', { min: 0, max: 10, nullable: true }) ?? null,
    rpe: r.num('rpe', { min: 1, max: 10, nullable: true }) ?? null,
    isWarmup: r.bool('isWarmup') ?? false,
    restSec: r.int('restSec', { min: 0, max: 3600, nullable: true }) ?? null,
    tempo: r.str('tempo', { max: 20, nullable: true }) || null
  };
}
type SetData = ReturnType<typeof readSet>;

const setRow = (workoutExerciseId: string, setIndex: number, s: SetData) => ({
  workoutExerciseId,
  setIndex,
  isWarmup: s.isWarmup,
  weight: s.weight != null ? String(s.weight) : null,
  reps: s.reps,
  rir: s.rir,
  rpe: s.rpe != null ? String(s.rpe) : null,
  tempo: s.tempo,
  restSec: s.restSec
});

const setOut = (s: typeof sets.$inferSelect) => ({
  id: s.id,
  setIndex: s.setIndex,
  weight: s.weight != null ? Number(s.weight) : null,
  reps: s.reps,
  rir: s.rir,
  rpe: s.rpe != null ? Number(s.rpe) : null,
  isWarmup: s.isWarmup,
  restSec: s.restSec,
  tempo: s.tempo,
  isPr: s.isPr
});

const hr = { type: 'integer', minimum: 30, maximum: 250 };
const cardioProps = {
  durationSec: { type: 'integer', minimum: 1, description: 'Total time. Optional when segments are given (they are summed).' },
  distance: { type: 'number', minimum: 0, description: "In the exercise's unit (mi/km)." },
  avgPaceSec: { type: 'integer', minimum: 1, description: 'Seconds per unit of distance. Derived from distance + duration if omitted.' },
  avgHr: hr,
  maxHr: hr,
  perceived: { type: 'integer', minimum: 1, maximum: 10, description: 'Perceived effort 1–10.' },
  segments: {
    type: 'array',
    maxItems: 200,
    description: 'Walk/jog/sprint breakdown in the order performed (for exercises that track speed zones, e.g. Running).',
    items: obj(
      {
        zone: { type: 'string', enum: ZONES },
        durationSec: { type: 'integer', minimum: 1 },
        distance: { type: 'number', minimum: 0 },
        paceSec: { type: 'integer', minimum: 1 }
      },
      ['zone', 'durationSec']
    )
  },
  intervals: {
    type: 'array',
    maxItems: 200,
    items: obj(
      {
        workSec: { type: 'integer', minimum: 1 },
        restSec: { type: 'integer', minimum: 0 },
        pace: { type: 'number' },
        hr: { type: 'integer' }
      },
      ['workSec', 'restSec']
    )
  }
};
const cardioSchema = obj(cardioProps);

type CardioData = Omit<CardioInput, 'workoutExerciseId'>;

function readCardio(r: ArgReader, extraKeys: string[] = []): CardioData {
  r.only(...Object.keys(cardioProps), ...extraKeys);
  const segments =
    r.objs('segments', { max: 200 })?.map((s) => {
      s.only('zone', 'durationSec', 'distance', 'paceSec');
      return {
        zone: s.oneOf('zone', ZONES, { required: true })!,
        durationSec: s.int('durationSec', { required: true, min: 1, max: 86_400 })!,
        ...defined({
          distance: s.num('distance', { min: 0, max: 1000 }) ?? undefined,
          paceSec: s.int('paceSec', { min: 1, max: 7200 }) ?? undefined
        })
      };
    }) ?? null;
  const intervals =
    r.objs('intervals', { max: 200 })?.map((s) => {
      s.only('workSec', 'restSec', 'pace', 'hr');
      return {
        workSec: s.int('workSec', { required: true, min: 1, max: 86_400 })!,
        restSec: s.int('restSec', { required: true, min: 0, max: 86_400 })!,
        ...defined({
          pace: s.num('pace', { min: 0 }) ?? undefined,
          hr: s.int('hr', { min: 30, max: 250 }) ?? undefined
        })
      };
    }) ?? null;
  const durationSec = r.int('durationSec', { min: 1, max: 172_800 });
  if (durationSec == null && !segments?.length) {
    throw new ToolError(`"${r.name('durationSec')}" (or "${r.name('segments')}") is required.`);
  }
  return {
    durationSec: durationSec ?? 0,
    distance: r.num('distance', { min: 0, max: 1000 }) ?? null,
    avgPaceSec: r.int('avgPaceSec', { min: 1, max: 7200 }) ?? null,
    avgHr: r.int('avgHr', { min: 30, max: 250 }) ?? null,
    maxHr: r.int('maxHr', { min: 30, max: 250 }) ?? null,
    perceived: r.int('perceived', { min: 1, max: 10 }) ?? null,
    segments,
    intervals
  };
}

const entryProps = {
  exerciseId: uuidProp('Exercise id from list_exercises.'),
  goal: {
    type: 'string',
    enum: GOALS,
    description: "Goal this session trained for. Default: the exercise's active goal."
  },
  notes: { type: 'string', maxLength: 2000 },
  orderIndex: { type: 'integer', minimum: 0, description: 'Position in the workout. Default: after the others.' },
  sets: { type: 'array', maxItems: 50, items: setSchema, description: 'Sets in order, for resistance work.' },
  cardio: { ...cardioSchema, description: 'A cardio bout, for cardio exercises.' }
};

type EntryPlan = {
  exercise: ExerciseRow;
  goal: Goal;
  notes: string | null;
  orderIndex?: number;
  sets: SetData[];
  cardio: CardioData | null;
};

/** Validate one workout entry up front (no writes), so a bad input fails before anything is saved. */
async function readEntry(userId: string, r: ArgReader, extraKeys: string[] = []): Promise<EntryPlan> {
  r.only(...Object.keys(entryProps), ...extraKeys);
  const exercise = await visibleExercise(userId, r.uuid('exerciseId', { required: true })!);
  const cardio = r.sub('cardio');
  return {
    exercise,
    goal: r.oneOf('goal', GOALS) ?? (await effectiveGoal(userId, exercise)),
    notes: r.str('notes', { max: 2000 }) || null,
    orderIndex: r.int('orderIndex', { min: 0, max: 999 }) ?? undefined,
    sets: r.objs('sets', { max: 50 })?.map(readSet) ?? [],
    cardio: cardio ? readCardio(cardio) : null
  };
}

async function writeEntry(tx: Tx, workoutId: string, plan: EntryPlan, orderIndex: number) {
  const [entry] = await tx
    .insert(workoutExercises)
    .values({
      workoutId,
      exerciseId: plan.exercise.id,
      goalSnapshot: plan.goal,
      orderIndex: plan.orderIndex ?? orderIndex,
      notes: plan.notes
    })
    .returning();
  if (plan.sets.length) {
    await tx.insert(sets).values(plan.sets.map((s, i) => setRow(entry.id, i + 1, s)));
  }
  if (plan.cardio) {
    await tx.insert(cardioBouts).values(cardioRow({ workoutExerciseId: entry.id, ...plan.cardio }));
  }
  return entry;
}

const readinessSchema = obj(
  {
    sleep: { type: 'integer', minimum: 1, maximum: 5 },
    energy: { type: 'integer', minimum: 1, maximum: 5 },
    soreness: { type: 'integer', minimum: 1, maximum: 5 },
    stress: { type: 'integer', minimum: 1, maximum: 5 }
  }
);

type Readiness = { sleep?: number; soreness?: number; stress?: number; energy?: number };

function readReadiness(r: ArgReader): Readiness | null | undefined {
  const s = r.sub('readiness', { nullable: true });
  if (s == null) return s;
  s.only('sleep', 'energy', 'soreness', 'stress');
  const out = defined({
    sleep: s.int('sleep', { min: 1, max: 5 }) ?? undefined,
    energy: s.int('energy', { min: 1, max: 5 }) ?? undefined,
    soreness: s.int('soreness', { min: 1, max: 5 }) ?? undefined,
    stress: s.int('stress', { min: 1, max: 5 }) ?? undefined
  }) as Readiness;
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const exerciseOut = (e: ExerciseRow) => ({
  id: e.id,
  name: e.name,
  modality: e.modality,
  kind: e.kind,
  muscleGroups: e.muscleGroups,
  unit: e.unit,
  tracksWeight: tracksWeight(e),
  loadIncrement: e.loadIncrement != null ? Number(e.loadIncrement) : null,
  defaultGoal: e.defaultGoal,
  tracksSpeedZones: e.tracksSpeedZones,
  archived: e.isArchived,
  custom: e.ownerId != null
});

async function routineOut(userId: string, groupId: string) {
  const [g] = await db
    .select()
    .from(exerciseGroups)
    .where(and(eq(exerciseGroups.id, groupId), eq(exerciseGroups.userId, userId)));
  if (!g) return null;
  const ids = await getGroupMemberIds(userId, groupId);
  const exs = ids.length
    ? await db
        .select({ id: exercises.id, name: exercises.name })
        .from(exercises)
        .where(inArray(exercises.id, ids))
        .orderBy(exercises.name)
    : [];
  const schedule = await getWeeklySchedule(userId);
  return {
    id: g.id,
    name: g.name,
    color: g.color,
    icon: g.icon,
    exercises: exs,
    weekdays: Object.entries(schedule)
      .filter(([, gs]) => gs.includes(groupId))
      .map(([d]) => Number(d))
  };
}

async function scheduleOut(userId: string) {
  const [schedule, groups] = await Promise.all([
    getWeeklySchedule(userId),
    db
      .select({ id: exerciseGroups.id, name: exerciseGroups.name })
      .from(exerciseGroups)
      .where(eq(exerciseGroups.userId, userId))
  ]);
  const name = new Map(groups.map((g) => [g.id, g.name]));
  return Object.fromEntries(
    Object.entries(schedule).map(([d, ids]) => [d, ids.map((id) => ({ id, name: name.get(id) }))])
  );
}

/** Put a routine on exactly the given weekdays, leaving other routines alone. */
async function placeOnWeekdays(userId: string, groupId: string, weekdays: number[]) {
  const schedule = await getWeeklySchedule(userId);
  for (let d = 0; d < 7; d++) {
    const has = schedule[d].includes(groupId);
    const want = weekdays.includes(d);
    if (has === want) continue;
    await setDaySchedule(
      userId,
      d,
      want ? [...schedule[d], groupId] : schedule[d].filter((id) => id !== groupId)
    );
  }
}

function readWeekdays(r: ArgReader, key: string) {
  const a = r.arr(key, { max: 7 });
  if (a == null) return a;
  return [
    ...new Set(
      a.map((v, i) => {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 6) {
          throw new ToolError(`"${key}[${i}]" must be a weekday 0–6 (0 = Sunday).`);
        }
        return v;
      })
    )
  ];
}

const isoDay = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay();

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const workoutFields = {
  title: { type: 'string', maxLength: 120 },
  notes: { type: 'string', maxLength: 4000 },
  sessionRpe: { type: 'integer', minimum: 1, maximum: 10, description: 'Whole-session effort 1–10.' },
  readiness: { ...readinessSchema, description: 'Pre-session check-in, each 1 (poor) – 5 (great); soreness/stress 5 = very sore/stressed.' }
};

export const WRITE_TOOLS: Tool[] = [
  // --- Workouts -------------------------------------------------------------
  {
    name: 'create_workout',
    title: 'Log a workout',
    description:
      'Log a whole workout in one call — exercises with their sets and/or cardio. Use it to record a session the user describes, or to back-fill past training (pass startedAt and endedAt or durationMin). ' +
      'By default the workout is saved as finished, which records PRs and refreshes next-session targets exactly like finishing it in the app. ' +
      "Weights are in each exercise's unit. Returns the saved workout with all ids.",
    scope: 'write',
    readOnly: false,
    inputSchema: obj({
      ...workoutFields,
      startedAt: { type: 'string', description: 'ISO date-time. Default: now.' },
      endedAt: { type: 'string', description: 'ISO date-time. Overrides durationMin.' },
      durationMin: { type: 'integer', minimum: 1, maximum: 1440, description: 'Session length, used to set endedAt from startedAt.' },
      finished: { type: 'boolean', description: 'Default true. false leaves it in progress until finish_workout.' },
      exercises: { type: 'array', maxItems: 40, items: obj(entryProps, ['exerciseId']) }
    }),
    async run(auth, args) {
      const r = new ArgReader(args).only(
        ...Object.keys(workoutFields),
        'startedAt',
        'endedAt',
        'durationMin',
        'finished',
        'exercises'
      );
      const startedAt = r.date('startedAt') ?? new Date();
      const durationMin = r.int('durationMin', { min: 1, max: 1440 });
      const finished = r.bool('finished') ?? true;
      let endedAt = r.date('endedAt') ?? null;
      if (!finished && endedAt) throw new ToolError('"endedAt" conflicts with "finished": false.');
      if (finished && !endedAt) {
        endedAt = durationMin
          ? new Date(startedAt.getTime() + durationMin * 60_000)
          : r.has('startedAt')
            ? startedAt
            : new Date();
      }
      if (endedAt && endedAt < startedAt) throw new ToolError('"endedAt" is before "startedAt".');
      if (startedAt.getTime() > Date.now() + 24 * 3600_000) {
        throw new ToolError('"startedAt" is in the future. To plan sessions, use routines and set_day_plan.');
      }

      const plans: EntryPlan[] = [];
      for (const e of r.objs('exercises', { max: 40 }) ?? []) plans.push(await readEntry(auth.userId, e));

      const workout = await db.transaction(async (tx) => {
        const [w] = await tx
          .insert(workouts)
          .values({
            userId: auth.userId,
            title: r.str('title', { max: 120 }) || null,
            notes: r.str('notes', { max: 4000 }) || null,
            sessionRpe: r.int('sessionRpe', { min: 1, max: 10 }) ?? null,
            readiness: readReadiness(r) ?? null,
            startedAt,
            endedAt
          })
          .returning();
        for (const [i, p] of plans.entries()) await writeEntry(tx, w.id, p, i);
        return w;
      });

      const { newPersonalRecords } = await refreshAfterChange(
        auth.userId,
        workout,
        plans.map((p) => p.exercise.id)
      );
      return { workout: await getWorkoutDetail(auth.userId, workout.id), newPersonalRecords };
    }
  },
  {
    name: 'update_workout',
    title: 'Update workout',
    description:
      'Change a workout\'s title, notes, session RPE, readiness, or start/end time. Pass null to clear title/notes/sessionRpe/readiness. finish=true finishes an in-progress workout (records PRs, refreshes targets).',
    scope: 'write',
    readOnly: false,
    idempotent: true,
    inputSchema: obj(
      {
        workoutId: uuidProp('Workout id.'),
        title: nullable(workoutFields.title),
        notes: nullable(workoutFields.notes),
        sessionRpe: nullable(workoutFields.sessionRpe),
        readiness: nullable(workoutFields.readiness),
        startedAt: { type: 'string', description: 'ISO date-time.' },
        endedAt: { type: 'string', description: 'ISO date-time. Setting it finishes the workout.' },
        finish: { type: 'boolean', description: 'Finish now (endedAt = now) if still in progress.' }
      },
      ['workoutId']
    ),
    async run(auth, args) {
      const r = new ArgReader(args).only(
        'workoutId',
        'title',
        'notes',
        'sessionRpe',
        'readiness',
        'startedAt',
        'endedAt',
        'finish'
      );
      const w = await ownedWorkout(auth.userId, r.uuid('workoutId', { required: true })!);
      const title = r.str('title', { max: 120, nullable: true });
      const notes = r.str('notes', { max: 4000, nullable: true });
      const patch: Partial<typeof workouts.$inferInsert> = defined({
        title: title === '' ? null : title,
        notes: notes === '' ? null : notes,
        sessionRpe: r.int('sessionRpe', { min: 1, max: 10, nullable: true }),
        readiness: readReadiness(r),
        startedAt: r.date('startedAt') ?? undefined,
        endedAt: r.date('endedAt') ?? undefined
      });
      if (r.bool('finish') && !w.endedAt && !patch.endedAt) patch.endedAt = new Date();
      if (!Object.keys(patch).length) throw new ToolError('Nothing to update.');

      const startedAt = patch.startedAt ?? w.startedAt;
      const endedAt = patch.endedAt ?? w.endedAt;
      if (endedAt && endedAt < startedAt) throw new ToolError('"endedAt" is before "startedAt".');

      const [row] = await db.update(workouts).set(patch).where(eq(workouts.id, w.id)).returning();

      // Newly finished, or a finished workout moved in time (changes which session is "last").
      let newPersonalRecords: unknown[] = [];
      if (row.endedAt && (!w.endedAt || patch.startedAt)) {
        const entries = await db
          .select({ exerciseId: workoutExercises.exerciseId })
          .from(workoutExercises)
          .where(eq(workoutExercises.workoutId, w.id));
        ({ newPersonalRecords } = await refreshAfterChange(
          auth.userId,
          row,
          entries.map((e) => e.exerciseId)
        ));
      }
      return { workout: await getWorkoutDetail(auth.userId, w.id), newPersonalRecords };
    }
  },
  {
    name: 'delete_workout',
    title: 'Delete workout',
    description:
      'Permanently delete a workout with all its exercises, sets, cardio and comments. Next-session targets for its exercises are recomputed. Confirm with the user first.',
    scope: 'write',
    readOnly: false,
    destructive: true,
    inputSchema: obj({ workoutId: uuidProp('Workout id.') }, ['workoutId']),
    async run(auth, args) {
      const r = new ArgReader(args).only('workoutId');
      const w = await ownedWorkout(auth.userId, r.uuid('workoutId', { required: true })!);
      const entries = await db
        .select({ id: workoutExercises.id, exerciseId: workoutExercises.exerciseId })
        .from(workoutExercises)
        .where(eq(workoutExercises.workoutId, w.id));
      const setIds = entries.length
        ? (
            await db
              .select({ id: sets.id })
              .from(sets)
              .where(inArray(sets.workoutExerciseId, entries.map((e) => e.id)))
          ).map((s) => s.id)
        : [];

      await db.transaction(async (tx) => {
        await tx
          .delete(comments)
          .where(
            and(
              eq(comments.userId, auth.userId),
              or(
                and(eq(comments.targetType, 'workout'), eq(comments.targetId, w.id)),
                setIds.length
                  ? and(eq(comments.targetType, 'set'), inArray(comments.targetId, setIds))
                  : sql`false`
              )
            )
          );
        await tx.delete(workouts).where(eq(workouts.id, w.id));
      });
      if (w.endedAt) await regenerate(auth.userId, entries.map((e) => e.exerciseId));
      return { deleted: true, workout: { id: w.id, title: w.title, startedAt: w.startedAt } };
    }
  },
  {
    name: 'add_workout_exercise',
    title: 'Add exercise to workout',
    description:
      'Add an exercise to an existing workout, optionally with its sets and/or cardio bout. Returns the new entry (its "id" is the workoutExerciseId used by log_sets / log_cardio).',
    scope: 'write',
    readOnly: false,
    inputSchema: obj({ workoutId: uuidProp('Workout id.'), ...entryProps }, ['workoutId', 'exerciseId']),
    async run(auth, args) {
      const r = new ArgReader(args);
      const w = await ownedWorkout(auth.userId, r.uuid('workoutId', { required: true })!);
      const plan = await readEntry(auth.userId, r, ['workoutId']);
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(workoutExercises)
        .where(eq(workoutExercises.workoutId, w.id));
      const entry = await db.transaction((tx) => writeEntry(tx, w.id, plan, n));
      const { newPersonalRecords } = await refreshAfterChange(auth.userId, w, [plan.exercise.id]);
      const detail = await getWorkoutDetail(auth.userId, w.id);
      return { entry: detail?.entries.find((e) => e.id === entry.id), newPersonalRecords };
    }
  },
  {
    name: 'update_workout_exercise',
    title: 'Update workout exercise',
    description: "Change an entry within a workout: the goal it trained for, its notes, or its position.",
    scope: 'write',
    readOnly: false,
    idempotent: true,
    inputSchema: obj(
      {
        workoutExerciseId: uuidProp('Entry id from get_workout (entries[].id).'),
        goal: { type: 'string', enum: GOALS },
        notes: nullable({ type: 'string', maxLength: 2000 }),
        orderIndex: { type: 'integer', minimum: 0 }
      },
      ['workoutExerciseId']
    ),
    async run(auth, args) {
      const r = new ArgReader(args).only('workoutExerciseId', 'goal', 'notes', 'orderIndex');
      const { entry } = await ownedEntry(auth.userId, r.uuid('workoutExerciseId', { required: true })!);
      const notes = r.str('notes', { max: 2000, nullable: true });
      const patch = defined({
        goalSnapshot: r.oneOf('goal', GOALS) ?? undefined,
        notes: notes === '' ? null : notes,
        orderIndex: r.int('orderIndex', { min: 0, max: 999 }) ?? undefined
      });
      if (!Object.keys(patch).length) throw new ToolError('Nothing to update.');
      const [row] = await db
        .update(workoutExercises)
        .set(patch)
        .where(eq(workoutExercises.id, entry.id))
        .returning();
      return row;
    }
  },
  {
    name: 'remove_workout_exercise',
    title: 'Remove exercise from workout',
    description: 'Remove an exercise entry from a workout, deleting its sets and cardio. Confirm with the user first.',
    scope: 'write',
    readOnly: false,
    destructive: true,
    inputSchema: obj({ workoutExerciseId: uuidProp('Entry id from get_workout (entries[].id).') }, ['workoutExerciseId']),
    async run(auth, args) {
      const r = new ArgReader(args).only('workoutExerciseId');
      const { entry, workout, exercise } = await ownedEntry(
        auth.userId,
        r.uuid('workoutExerciseId', { required: true })!
      );
      await db.delete(workoutExercises).where(eq(workoutExercises.id, entry.id));
      if (workout.endedAt) await regenerate(auth.userId, [entry.exerciseId]);
      return { removed: true, exercise: exercise.name, workoutId: workout.id };
    }
  },

  // --- Sets & cardio --------------------------------------------------------
  {
    name: 'log_sets',
    title: 'Log sets',
    description:
      "Append one or more sets to an exercise entry in a workout. Weights in the exercise's unit; omit weight for bodyweight. Returns the saved sets and any new PRs.",
    scope: 'write',
    readOnly: false,
    inputSchema: obj(
      {
        workoutExerciseId: uuidProp('Entry id from get_workout / add_workout_exercise.'),
        sets: { type: 'array', minItems: 1, maxItems: 50, items: setSchema }
      },
      ['workoutExerciseId', 'sets']
    ),
    async run(auth, args) {
      const r = new ArgReader(args).only('workoutExerciseId', 'sets');
      const { entry, workout } = await ownedEntry(auth.userId, r.uuid('workoutExerciseId', { required: true })!);
      const input = r.objs('sets', { required: true, max: 50 })!.map(readSet);
      if (!input.length) throw new ToolError('"sets" must not be empty.');
      const inserted = await db.transaction(async (tx) => {
        const [{ max }] = await tx
          .select({ max: sql<number>`coalesce(max(${sets.setIndex}), 0)`.mapWith(Number) })
          .from(sets)
          .where(eq(sets.workoutExerciseId, entry.id));
        return tx
          .insert(sets)
          .values(input.map((s, i) => setRow(entry.id, max + i + 1, s)))
          .returning();
      });
      const { newPersonalRecords } = await refreshAfterChange(auth.userId, workout, [entry.exerciseId]);
      return { sets: inserted.map(setOut), newPersonalRecords };
    }
  },
  {
    name: 'update_set',
    title: 'Update set',
    description: 'Correct a logged set. Only the fields given change; pass null to clear weight/rir/rpe/restSec/tempo.',
    scope: 'write',
    readOnly: false,
    idempotent: true,
    inputSchema: obj(
      {
        setId: uuidProp('Set id from get_workout.'),
        ...setProps,
        setIndex: { type: 'integer', minimum: 1, description: 'Position within the exercise.' }
      },
      ['setId']
    ),
    async run(auth, args) {
      const r = new ArgReader(args).only('setId', 'setIndex', ...Object.keys(setProps));
      const { set, workout, entry } = await ownedSet(auth.userId, r.uuid('setId', { required: true })!);
      const weight = r.num('weight', { min: 0, max: 5000, nullable: true });
      const rpe = r.num('rpe', { min: 1, max: 10, nullable: true });
      const tempo = r.str('tempo', { max: 20, nullable: true });
      const patch: Partial<typeof sets.$inferInsert> = defined({
        weight: weight === undefined ? undefined : weight === null ? null : String(weight),
        reps: r.int('reps', { min: 0, max: 1000 }) ?? undefined,
        rir: r.int('rir', { min: 0, max: 10, nullable: true }),
        rpe: rpe === undefined ? undefined : rpe === null ? null : String(rpe),
        isWarmup: r.bool('isWarmup') ?? undefined,
        restSec: r.int('restSec', { min: 0, max: 3600, nullable: true }),
        tempo: tempo === '' ? null : tempo,
        setIndex: r.int('setIndex', { min: 1, max: 999 }) ?? undefined
      });
      if (!Object.keys(patch).length) throw new ToolError('Nothing to update.');
      const [row] = await db.update(sets).set(patch).where(eq(sets.id, set.id)).returning();
      const { newPersonalRecords } = await refreshAfterChange(auth.userId, workout, [entry.exerciseId]);
      return { set: setOut(row), newPersonalRecords };
    }
  },
  {
    name: 'delete_set',
    title: 'Delete set',
    description: 'Delete one logged set.',
    scope: 'write',
    readOnly: false,
    destructive: true,
    inputSchema: obj({ setId: uuidProp('Set id from get_workout.') }, ['setId']),
    async run(auth, args) {
      const r = new ArgReader(args).only('setId');
      const { set, workout, entry } = await ownedSet(auth.userId, r.uuid('setId', { required: true })!);
      await db.transaction(async (tx) => {
        await tx
          .delete(comments)
          .where(
            and(
              eq(comments.userId, auth.userId),
              eq(comments.targetType, 'set'),
              eq(comments.targetId, set.id)
            )
          );
        await tx.delete(sets).where(eq(sets.id, set.id));
      });
      if (workout.endedAt) await regenerate(auth.userId, [entry.exerciseId]);
      return { deleted: true };
    }
  },
  {
    name: 'log_cardio',
    title: 'Log cardio',
    description:
      "Record a cardio bout (run, ride, row…) on an exercise entry in a workout. Give durationSec and/or walk/jog/sprint segments, plus distance in the exercise's unit. To correct one, delete_cardio and log again.",
    scope: 'write',
    readOnly: false,
    inputSchema: obj(
      { workoutExerciseId: uuidProp('Entry id from get_workout / add_workout_exercise.'), ...cardioProps },
      ['workoutExerciseId']
    ),
    async run(auth, args) {
      const r = new ArgReader(args);
      const { entry, workout } = await ownedEntry(auth.userId, r.uuid('workoutExerciseId', { required: true })!);
      const data = readCardio(r, ['workoutExerciseId']);
      const [row] = await db
        .insert(cardioBouts)
        .values(cardioRow({ workoutExerciseId: entry.id, ...data }))
        .returning();
      const { newPersonalRecords } = await refreshAfterChange(auth.userId, workout, [entry.exerciseId]);
      return {
        cardio: { ...row, distance: row.distance != null ? Number(row.distance) : null },
        newPersonalRecords
      };
    }
  },
  {
    name: 'delete_cardio',
    title: 'Delete cardio bout',
    description: 'Delete a cardio bout (id from get_workout entries[].cardio.id).',
    scope: 'write',
    readOnly: false,
    destructive: true,
    inputSchema: obj({ cardioId: uuidProp('Cardio bout id.') }, ['cardioId']),
    async run(auth, args) {
      const r = new ArgReader(args).only('cardioId');
      const { bout, workout, entry } = await ownedBout(auth.userId, r.uuid('cardioId', { required: true })!);
      await db.delete(cardioBouts).where(eq(cardioBouts.id, bout.id));
      if (workout.endedAt) await regenerate(auth.userId, [entry.exerciseId]);
      return { deleted: true };
    }
  },

  // --- Exercises & goals ----------------------------------------------------
  {
    name: 'create_exercise',
    title: 'Create exercise',
    description:
      "Add a custom exercise to the user's library. Check list_exercises first — the built-in library is large and duplicate names are rejected. " +
      'Barbell, dumbbell and machine exercises are logged with weight × reps (tracksWeight); bodyweight ones with reps only; cardio with time/distance.',
    scope: 'write',
    readOnly: false,
    inputSchema: obj(EXERCISE_FIELDS, ['name', 'modality']),
    async run(auth, args) {
      const input = readNewExercise(new ArgReader(args));
      const dupe = await findExerciseByName(auth.userId, input.name);
      if (dupe) {
        throw new ToolError(
          `An exercise named "${dupe.name}" already exists (id ${dupe.id}${dupe.isArchived ? ', archived — restore it with update_exercise archived=false' : ''}).`
        );
      }
      let unit = input.unit;
      if (!unit) {
        const [u] = await db.select({ unit: users.defaultUnit }).from(users).where(eq(users.id, auth.userId));
        unit = input.modality === 'cardio' ? 'mi' : (u?.unit ?? 'lb');
      }
      return exerciseOut(await createExercise(auth.userId, { ...input, unit }));
    }
  },
  {
    name: 'update_exercise',
    title: 'Update exercise',
    description:
      'Edit a custom exercise (built-ins are read-only): name, type (modality), unit, weight step, muscle groups, default goal, speed zones. Only the fields given change. Switching to barbell/dumbbell/machine turns on weight logging. Changing the unit does not convert logged weights. archived=false restores an archived exercise.',
    scope: 'write',
    readOnly: false,
    idempotent: true,
    inputSchema: obj(
      {
        exerciseId: uuidProp('Custom exercise id.'),
        ...EXERCISE_FIELDS,
        archived: { type: 'boolean', description: 'true hides it from the library; false restores it.' }
      },
      ['exerciseId']
    ),
    async run(auth, args) {
      const r = new ArgReader(args);
      const ex = await customExercise(auth.userId, r.uuid('exerciseId', { required: true })!);
      const patch = readExercisePatch(r, ['exerciseId']);
      if (patch.name) {
        const dupe = await findExerciseByName(auth.userId, patch.name, ex.id);
        if (dupe) throw new ToolError(`An exercise named "${dupe.name}" already exists (id ${dupe.id}).`);
      }
      return exerciseOut((await updateExercise(auth.userId, ex.id, patch))!);
    }
  },
  {
    name: 'delete_exercise',
    title: 'Delete exercise',
    description:
      'Delete a custom exercise. If it has ever been logged it is archived instead (hidden, history kept, restorable with update_exercise); otherwise it is removed for good along with its goals, routine memberships and comments. Confirm with the user first.',
    scope: 'write',
    readOnly: false,
    destructive: true,
    inputSchema: obj({ exerciseId: uuidProp('Custom exercise id.') }, ['exerciseId']),
    async run(auth, args) {
      const r = new ArgReader(args).only('exerciseId');
      const ex = await customExercise(auth.userId, r.uuid('exerciseId', { required: true })!);
      const result = await deleteExercise(auth.userId, ex.id);
      return result === 'archived'
        ? { archived: true, name: ex.name, reason: 'It has logged history, so it was archived rather than deleted.' }
        : { deleted: true, name: ex.name };
    }
  },
  {
    name: 'set_exercise_goal',
    title: 'Set exercise goal',
    description:
      "Set the user's training goal for an exercise (strength / endurance / stamina) with its rep range, sets and RIR target — this drives the progression engine. Works on built-in and custom exercises. Unspecified fields use the goal's defaults (strength 3–6 reps, endurance 12–20, stamina by mode). Returns the new next-session target.",
    scope: 'write',
    readOnly: false,
    idempotent: true,
    inputSchema: obj({ exerciseId: uuidProp('Exercise id (built-in or custom).'), ...GOAL_FIELDS }, ['exerciseId', 'goal']),
    async run(auth, args) {
      const r = new ArgReader(args);
      const ex = await visibleExercise(auth.userId, r.uuid('exerciseId', { required: true })!);
      const { goal, opts } = readGoal(r, ['exerciseId']);
      const row = await setGoal(auth.userId, ex.id, goal, opts);
      const rec = await generateForExercise(auth.userId, ex.id);
      return {
        exercise: ex.name,
        goal: row,
        nextTarget: rec ? { target: rec.target, rationale: rec.rationale } : null
      };
    }
  },
  {
    name: 'clear_exercise_goal',
    title: 'Clear exercise goal',
    description: "Remove the user's goal for an exercise so it falls back to the exercise's default goal.",
    scope: 'write',
    readOnly: false,
    idempotent: true,
    inputSchema: obj({ exerciseId: uuidProp('Exercise id.') }, ['exerciseId']),
    async run(auth, args) {
      const r = new ArgReader(args).only('exerciseId');
      const ex = await visibleExercise(auth.userId, r.uuid('exerciseId', { required: true })!);
      await clearGoal(auth.userId, ex.id);
      const rec = await generateForExercise(auth.userId, ex.id);
      return {
        exercise: ex.name,
        effectiveGoal: ex.defaultGoal ?? 'strength',
        nextTarget: rec ? { target: rec.target, rationale: rec.rationale } : null
      };
    }
  },

  // --- Routines & schedule --------------------------------------------------
  {
    name: 'create_routine',
    title: 'Create routine',
    description:
      'Create a routine (a named exercise group like "Push" or "Legs") with its exercises, optionally putting it on weekdays of the weekly schedule.',
    scope: 'write',
    readOnly: false,
    inputSchema: obj(
      {
        name: { type: 'string', minLength: 1, maxLength: 60 },
        color: { type: 'string', enum: COLORS },
        icon: { type: 'string', maxLength: 40 },
        exerciseIds: { type: 'array', maxItems: 60, items: { type: 'string', format: 'uuid' } },
        weekdays: { type: 'array', maxItems: 7, items: { type: 'integer', minimum: 0, maximum: 6 }, description: `Days to schedule it on. ${WEEKDAYS}` }
      },
      ['name']
    ),
    async run(auth, args) {
      const r = new ArgReader(args).only('name', 'color', 'icon', 'exerciseIds', 'weekdays');
      const name = r.str('name', { required: true, max: 60 })!;
      const exerciseIds = r.uuids('exerciseIds', { max: 60 }) ?? [];
      const weekdays = readWeekdays(r, 'weekdays') ?? [];
      await assertExercisesUsable(auth.userId, exerciseIds);
      const g = await createGroup(auth.userId, {
        name,
        color: r.oneOf('color', COLORS) ?? null,
        icon: r.str('icon', { max: 40 }) || null
      });
      if (exerciseIds.length) await setGroupMembers(auth.userId, g.id, exerciseIds);
      if (weekdays.length) await placeOnWeekdays(auth.userId, g.id, weekdays);
      return routineOut(auth.userId, g.id);
    }
  },
  {
    name: 'update_routine',
    title: 'Update routine',
    description:
      'Rename/recolor a routine, change its exercises (replace all with exerciseIds, or add/remove some), or set exactly which weekdays it is scheduled on.',
    scope: 'write',
    readOnly: false,
    idempotent: true,
    inputSchema: obj(
      {
        routineId: uuidProp('Routine id from get_routines.'),
        name: { type: 'string', minLength: 1, maxLength: 60 },
        color: nullable({ type: 'string', enum: COLORS }),
        icon: nullable({ type: 'string', maxLength: 40 }),
        exerciseIds: { type: 'array', maxItems: 60, items: { type: 'string', format: 'uuid' }, description: 'Replace the full exercise list.' },
        addExerciseIds: { type: 'array', maxItems: 60, items: { type: 'string', format: 'uuid' } },
        removeExerciseIds: { type: 'array', maxItems: 60, items: { type: 'string', format: 'uuid' } },
        weekdays: { type: 'array', maxItems: 7, items: { type: 'integer', minimum: 0, maximum: 6 }, description: `Exactly the days it runs on ([] = unscheduled). ${WEEKDAYS}` }
      },
      ['routineId']
    ),
    async run(auth, args) {
      const r = new ArgReader(args).only(
        'routineId',
        'name',
        'color',
        'icon',
        'exerciseIds',
        'addExerciseIds',
        'removeExerciseIds',
        'weekdays'
      );
      const id = r.uuid('routineId', { required: true })!;
      await assertGroupsOwned(auth.userId, [id]);
      const name = r.str('name', { max: 60 });
      if (name === '') throw new ToolError('"name" must not be empty.');
      const icon = r.str('icon', { max: 40, nullable: true });
      const meta = defined({
        name: name ?? undefined,
        color: r.oneOf('color', COLORS, { nullable: true }),
        icon: icon === '' ? null : icon
      });
      const replace = r.uuids('exerciseIds', { max: 60 });
      const add = r.uuids('addExerciseIds', { max: 60 }) ?? [];
      const remove = r.uuids('removeExerciseIds', { max: 60 }) ?? [];
      if (replace && (add.length || remove.length)) {
        throw new ToolError('Use either "exerciseIds" or "addExerciseIds"/"removeExerciseIds", not both.');
      }
      const weekdays = readWeekdays(r, 'weekdays');
      if (!Object.keys(meta).length && !replace && !add.length && !remove.length && !weekdays) {
        throw new ToolError('Nothing to update.');
      }

      await assertExercisesUsable(auth.userId, [...(replace ?? []), ...add]);
      if (Object.keys(meta).length) await updateGroup(auth.userId, id, meta);
      if (replace || add.length || remove.length) {
        const current = await getGroupMemberIds(auth.userId, id);
        const next = replace ?? [...new Set([...current, ...add])].filter((x) => !remove.includes(x));
        await setGroupMembers(auth.userId, id, next);
      }
      if (weekdays) await placeOnWeekdays(auth.userId, id, weekdays);
      return routineOut(auth.userId, id);
    }
  },
  {
    name: 'delete_routine',
    title: 'Delete routine',
    description: 'Delete a routine and remove it from the schedule. Exercises and logged workouts are not affected.',
    scope: 'write',
    readOnly: false,
    destructive: true,
    inputSchema: obj({ routineId: uuidProp('Routine id from get_routines.') }, ['routineId']),
    async run(auth, args) {
      const r = new ArgReader(args).only('routineId');
      const id = r.uuid('routineId', { required: true })!;
      const before = await routineOut(auth.userId, id);
      if (!before) throw new ToolError('Routine not found.');
      await deleteGroup(auth.userId, id);
      return { deleted: true, name: before.name };
    }
  },
  {
    name: 'set_weekly_schedule',
    title: 'Set weekly schedule',
    description: `Set which routines run on given weekdays. Each listed day is replaced (routineIds [] = rest day); days not listed are unchanged. ${WEEKDAYS}`,
    scope: 'write',
    readOnly: false,
    idempotent: true,
    inputSchema: obj(
      {
        days: {
          type: 'array',
          minItems: 1,
          maxItems: 7,
          items: obj(
            {
              dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 },
              routineIds: { type: 'array', maxItems: 20, items: { type: 'string', format: 'uuid' } }
            },
            ['dayOfWeek', 'routineIds']
          )
        }
      },
      ['days']
    ),
    async run(auth, args) {
      const r = new ArgReader(args).only('days');
      const days = r.objs('days', { required: true, max: 7 })!.map((d) => {
        d.only('dayOfWeek', 'routineIds');
        return {
          dayOfWeek: d.int('dayOfWeek', { required: true, min: 0, max: 6 })!,
          routineIds: d.uuids('routineIds', { required: true, max: 20 })!
        };
      });
      if (!days.length) throw new ToolError('"days" must not be empty.');
      if (new Set(days.map((d) => d.dayOfWeek)).size !== days.length) {
        throw new ToolError('Each dayOfWeek may appear only once.');
      }
      await assertGroupsOwned(auth.userId, days.flatMap((d) => d.routineIds));
      for (const d of days) await setDaySchedule(auth.userId, d.dayOfWeek, d.routineIds);
      return { weeklySchedule: await scheduleOut(auth.userId) };
    }
  },
  {
    name: 'set_day_plan',
    title: 'Set plan for a date',
    description:
      "Override which routines are planned for one date (a one-off swap) without changing the weekly schedule. routineIds [] clears the override so the date follows the weekly schedule again.",
    scope: 'write',
    readOnly: false,
    idempotent: true,
    inputSchema: obj(
      {
        date: { type: 'string', description: 'YYYY-MM-DD (user-local date).' },
        routineIds: { type: 'array', maxItems: 20, items: { type: 'string', format: 'uuid' } }
      },
      ['date', 'routineIds']
    ),
    async run(auth, args) {
      const r = new ArgReader(args).only('date', 'routineIds');
      const date = r.day('date', { required: true })!;
      const ids = r.uuids('routineIds', { required: true, max: 20 })!;
      await assertGroupsOwned(auth.userId, ids);
      await setDayPlan(auth.userId, date, ids);
      const plan = await resolveActiveGroups(auth.userId, date, isoDay(date));
      return { date, ...plan };
    }
  },

  // --- Targets & profile ----------------------------------------------------
  {
    name: 'update_next_target',
    title: 'Adjust next-session target',
    description:
      "Override what the app suggests for an exercise's next session (shown on Today and pre-filled in the logger). Pass target fields to change — they merge into the current target, e.g. {\"weight\": 185, \"reps\": 5} or {\"sets\": 4}; cardio uses fields like distance/durationSec/targetPaceSec. Or set status to accept/skip it.",
    scope: 'write',
    readOnly: false,
    idempotent: true,
    inputSchema: obj(
      {
        recommendationId: uuidProp('Recommendation id from get_recommendations.'),
        target: {
          type: 'object',
          description: 'Fields to change: sets, reps, repLow, repHigh, weight, rir, distance, durationSec, targetPaceSec, …',
          additionalProperties: { type: ['number', 'string', 'boolean', 'null'] }
        },
        status: { type: 'string', enum: ['accepted', 'skipped'] }
      },
      ['recommendationId']
    ),
    async run(auth, args) {
      const r = new ArgReader(args).only('recommendationId', 'target', 'status');
      const id = r.uuid('recommendationId', { required: true })!;
      const [rec] = await db
        .select()
        .from(recommendations)
        .where(and(eq(recommendations.id, id), eq(recommendations.userId, auth.userId)));
      if (!rec) throw new ToolError('Recommendation not found. Use an id from get_recommendations.');
      const t = r.sub('target');
      const status = r.oneOf('status', ['accepted', 'skipped'] as const);
      if (!t && !status) throw new ToolError('Give "target" fields and/or a "status".');
      if (t && status === 'skipped') throw new ToolError('Adjusting a target and skipping it conflict.');
      if (t) {
        const entries = Object.entries(t.raw);
        if (!entries.length || entries.length > 20) throw new ToolError('"target" needs 1–20 fields.');
        for (const [k, v] of entries) {
          const ok =
            v === null ||
            typeof v === 'boolean' ||
            (typeof v === 'number' && Number.isFinite(v)) ||
            (typeof v === 'string' && v.length <= 200);
          if (!ok || k.length > 40) throw new ToolError(`"target.${k}" must be a number, short string, boolean or null.`);
        }
        await updateRecommendationTarget(auth.userId, id, { ...rec.target, ...t.raw });
      } else if (status) {
        await setRecommendationStatus(auth.userId, id, status);
      }
      const [row] = await db.select().from(recommendations).where(eq(recommendations.id, id));
      return { id: row.id, exerciseId: row.exerciseId, target: row.target, status: row.status, rationale: row.rationale };
    }
  },
  {
    name: 'regenerate_targets',
    title: 'Recompute next-session targets',
    description:
      "Re-run the progression engine for some exercises (or every exercise that currently has a target), discarding pending suggestions. Use after editing past workouts or goals.",
    scope: 'write',
    readOnly: false,
    idempotent: true,
    inputSchema: obj({
      exerciseIds: { type: 'array', maxItems: 100, items: { type: 'string', format: 'uuid' }, description: 'Default: all exercises with a current target.' }
    }),
    async run(auth, args) {
      const r = new ArgReader(args).only('exerciseIds');
      let ids = r.uuids('exerciseIds', { max: 100 });
      if (ids) {
        for (const id of ids) await visibleExercise(auth.userId, id);
      } else {
        ids = (await getRecommendationsForPrefill(auth.userId)).map((x) => x.exerciseId);
      }
      await regenerate(auth.userId, ids);
      const fresh = await getRecommendationsForPrefill(auth.userId);
      return fresh
        .filter((x) => ids!.includes(x.exerciseId))
        .map((x) => ({ id: x.id, exerciseId: x.exerciseId, name: x.name, target: x.target, rationale: x.rationale }));
    }
  },
  {
    name: 'update_profile',
    title: 'Update profile',
    description: "Change the user's preferred weight unit for new exercises. Existing exercises and logged weights are not converted.",
    scope: 'write',
    readOnly: false,
    idempotent: true,
    inputSchema: obj({ defaultUnit: { type: 'string', enum: ['lb', 'kg'] } }, ['defaultUnit']),
    async run(auth, args) {
      const r = new ArgReader(args).only('defaultUnit');
      const defaultUnit = r.oneOf('defaultUnit', ['lb', 'kg'] as const, { required: true })!;
      await db.update(users).set({ defaultUnit }).where(eq(users.id, auth.userId));
      return { defaultUnit };
    }
  }
];
