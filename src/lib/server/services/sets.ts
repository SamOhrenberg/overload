import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sets, workoutExercises, workouts } from '$lib/server/db/schema';

export type SetInput = {
  workoutExerciseId: string;
  setIndex?: number;
  weight?: number | null;
  reps: number;
  rir?: number | null;
  rpe?: number | null;
  tempo?: string | null;
  restSec?: number | null;
  isWarmup?: boolean;
};

export async function logSet(input: SetInput) {
  // Default set_index to the next slot for this exercise entry.
  let setIndex = input.setIndex;
  if (setIndex === undefined) {
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${sets.setIndex}), 0)` })
      .from(sets)
      .where(eq(sets.workoutExerciseId, input.workoutExerciseId));
    setIndex = Number(max) + 1;
  }

  const [row] = await db
    .insert(sets)
    .values({
      workoutExerciseId: input.workoutExerciseId,
      setIndex,
      weight: input.weight != null ? String(input.weight) : null,
      reps: input.reps,
      rir: input.rir ?? null,
      rpe: input.rpe != null ? String(input.rpe) : null,
      tempo: input.tempo ?? null,
      restSec: input.restSec ?? null,
      isWarmup: input.isWarmup ?? false
    })
    .returning();
  return row;
}

export async function updateSet(id: string, patch: Partial<SetInput>) {
  const [row] = await db
    .update(sets)
    .set({
      weight: patch.weight != null ? String(patch.weight) : undefined,
      reps: patch.reps,
      rir: patch.rir,
      isWarmup: patch.isWarmup
    })
    .where(eq(sets.id, id))
    .returning();
  return row ?? null;
}

export async function deleteSet(id: string) {
  await db.delete(sets).where(eq(sets.id, id));
}

/**
 * The working sets of the most recent *previous* session for an exercise.
 * Used for the "last time" reference and as the engine's primary input.
 */
export async function lastWorkingSets(
  userId: string,
  exerciseId: string,
  excludeWorkoutId?: string
) {
  const [lastEntry] = await db
    .select({ id: workoutExercises.id, startedAt: workouts.startedAt })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workoutExercises.exerciseId, exerciseId),
        excludeWorkoutId ? sql`${workoutExercises.workoutId} <> ${excludeWorkoutId}` : sql`true`
      )
    )
    .orderBy(desc(workouts.startedAt))
    .limit(1);

  if (!lastEntry) return { performedAt: null, sets: [] as (typeof rows)[number][] };

  const rows = await db
    .select()
    .from(sets)
    .where(and(eq(sets.workoutExerciseId, lastEntry.id), eq(sets.isWarmup, false)))
    .orderBy(sets.setIndex);

  return { performedAt: lastEntry.startedAt, sets: rows };
}
