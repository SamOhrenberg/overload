import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { comments, exercises, workoutExercises } from '$lib/server/db/schema';
import type { Goal } from '$lib/server/db/schema';
import {
  LOADED_MODALITIES,
  defaultLoadIncrement,
  type ExerciseKind,
  type ExerciseUnit,
  type Modality
} from '$lib/exercise';

export type ExerciseRow = typeof exercises.$inferSelect;

/** Built-in library plus this user's custom exercises (non-archived). */
export async function listExercises(userId: string) {
  return db
    .select()
    .from(exercises)
    .where(
      and(
        or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)),
        eq(exercises.isArchived, false)
      )
    )
    .orderBy(exercises.name);
}

/** A built-in or one of this user's exercises (archived included), else null. */
export async function getVisibleExercise(userId: string, id: string): Promise<ExerciseRow | null> {
  const [row] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), or(isNull(exercises.ownerId), eq(exercises.ownerId, userId))));
  return row ?? null;
}

/** An exercise visible to the user with this name (case-insensitive), if any. */
export async function findExerciseByName(userId: string, name: string, excludeId?: string) {
  const [row] = await db
    .select({ id: exercises.id, name: exercises.name, isArchived: exercises.isArchived })
    .from(exercises)
    .where(
      and(
        sql`lower(${exercises.name}) = ${name.trim().toLowerCase()}`,
        or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)),
        excludeId ? ne(exercises.id, excludeId) : undefined
      )
    )
    .limit(1);
  return row ?? null;
}

export async function hasHistory(exerciseId: string): Promise<boolean> {
  const [used] = await db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(eq(workoutExercises.exerciseId, exerciseId))
    .limit(1);
  return !!used;
}

/**
 * Loaded exercises always carry a load step, so the logger offers a weight.
 * Cardio never has one; bodyweight keeps one only if given (weighted variants).
 */
function withLoadStep(modality: string, unit: string, inc: number | null | undefined) {
  if (modality === 'cardio') return null;
  if (inc != null && inc > 0) return String(inc);
  return LOADED_MODALITIES.includes(modality as Modality) ? String(defaultLoadIncrement(unit)) : null;
}

export type ExerciseInput = {
  name: string;
  modality: Modality;
  kind?: ExerciseKind;
  muscleGroups?: string[];
  unit?: ExerciseUnit;
  loadIncrement?: number | null;
  defaultGoal?: Goal | null;
  tracksSpeedZones?: boolean;
};

export async function createExercise(userId: string, data: ExerciseInput) {
  const kind = data.kind ?? (data.modality === 'cardio' ? 'cardio' : 'resistance');
  const unit = data.unit ?? (kind === 'cardio' ? 'mi' : 'lb');
  const [row] = await db
    .insert(exercises)
    .values({
      ownerId: userId,
      name: data.name.trim(),
      modality: data.modality,
      kind,
      muscleGroups: data.muscleGroups ?? [],
      unit,
      loadIncrement: withLoadStep(data.modality, unit, data.loadIncrement),
      defaultGoal: data.defaultGoal ?? null,
      tracksSpeedZones: data.tracksSpeedZones ?? false
    })
    .returning();
  return row;
}

export type ExercisePatch = Partial<ExerciseInput> & { isArchived?: boolean };

/**
 * Edit one of the user's own exercises (built-ins are read-only — the caller
 * checks, and the owner_id filter here enforces it). Switching modality moves
 * kind along with it unless kind is given, and a loaded exercise left without
 * a load step gets the unit default. Returns null if nothing matched.
 */
export async function updateExercise(userId: string, id: string, patch: ExercisePatch) {
  const [cur] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.ownerId, userId)));
  if (!cur) return null;

  const modality = patch.modality ?? cur.modality;
  const unit = patch.unit ?? cur.unit;
  let kind = patch.kind ?? cur.kind;
  if (!patch.kind && patch.modality && patch.modality !== cur.modality) {
    kind = modality === 'cardio' ? 'cardio' : cur.kind === 'cardio' ? 'resistance' : cur.kind;
  }
  const inc =
    patch.loadIncrement !== undefined
      ? patch.loadIncrement
      : cur.loadIncrement != null
        ? Number(cur.loadIncrement)
        : null;

  const [row] = await db
    .update(exercises)
    .set({
      name: patch.name?.trim() ?? cur.name,
      modality,
      kind,
      unit,
      muscleGroups: patch.muscleGroups ?? cur.muscleGroups,
      loadIncrement: withLoadStep(modality, unit, inc),
      defaultGoal: patch.defaultGoal !== undefined ? patch.defaultGoal : cur.defaultGoal,
      tracksSpeedZones: patch.tracksSpeedZones ?? cur.tracksSpeedZones,
      isArchived: patch.isArchived ?? cur.isArchived
    })
    .where(and(eq(exercises.id, id), eq(exercises.ownerId, userId)))
    .returning();
  return row ?? null;
}

/**
 * Remove one of the user's own exercises. One that has been logged is archived
 * (hidden, history kept); otherwise it is deleted with its goals, routine
 * memberships, targets and comments. Returns null if nothing matched.
 */
export async function deleteExercise(userId: string, id: string): Promise<'archived' | 'deleted' | null> {
  const [cur] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.ownerId, userId)));
  if (!cur) return null;
  if (await hasHistory(id)) {
    await db.update(exercises).set({ isArchived: true }).where(eq(exercises.id, id));
    return 'archived';
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(comments)
      .where(
        and(eq(comments.userId, userId), eq(comments.targetType, 'exercise'), eq(comments.targetId, id))
      );
    await tx.delete(exercises).where(eq(exercises.id, id));
  });
  return 'deleted';
}
