import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { workouts, workoutExercises, exercises, sets, cardioBouts } from '$lib/server/db/schema';
import type { Goal } from '$lib/server/db/schema';
import { zoneAggregates } from '$lib/server/engine/runZones';

export async function startWorkout(userId: string, title?: string | null) {
  const [row] = await db
    .insert(workouts)
    .values({ userId, title: title ?? null })
    .returning();
  return row;
}

export async function finishWorkout(
  userId: string,
  workoutId: string,
  patch: { notes?: string | null; sessionRpe?: number | null; readiness?: unknown }
) {
  const [row] = await db
    .update(workouts)
    .set({
      endedAt: new Date(),
      notes: patch.notes ?? null,
      sessionRpe: patch.sessionRpe ?? null,
      readiness: (patch.readiness as never) ?? null
    })
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .returning();
  return row ?? null;
}

export async function listWorkouts(userId: string, limit = 30) {
  return db
    .select()
    .from(workouts)
    .where(eq(workouts.userId, userId))
    .orderBy(desc(workouts.startedAt))
    .limit(limit);
}

export async function getWorkout(userId: string, workoutId: string) {
  const [w] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)));
  if (!w) return null;

  const entries = await db
    .select({
      id: workoutExercises.id,
      exerciseId: workoutExercises.exerciseId,
      orderIndex: workoutExercises.orderIndex,
      goalSnapshot: workoutExercises.goalSnapshot,
      notes: workoutExercises.notes,
      name: exercises.name,
      kind: exercises.kind,
      unit: exercises.unit
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(workoutExercises.orderIndex);

  return { ...w, entries };
}

/**
 * Full detail for one workout: its exercise entries, each with the sets logged
 * and any cardio bout. Powers the history detail view. Scoped to the owner.
 */
export async function getWorkoutDetail(userId: string, workoutId: string) {
  const base = await getWorkout(userId, workoutId);
  if (!base) return null;

  const entries = await Promise.all(
    base.entries.map(async (e) => {
      const entrySets = await db
        .select()
        .from(sets)
        .where(eq(sets.workoutExerciseId, e.id))
        .orderBy(sets.setIndex);
      const [bout] = await db
        .select()
        .from(cardioBouts)
        .where(eq(cardioBouts.workoutExerciseId, e.id))
        .limit(1);

      return {
        ...e,
        sets: entrySets.map((s) => ({
          id: s.id,
          setIndex: s.setIndex,
          isWarmup: s.isWarmup,
          weight: s.weight != null ? Number(s.weight) : null,
          reps: s.reps,
          rir: s.rir,
          rpe: s.rpe != null ? Number(s.rpe) : null,
          tempo: s.tempo,
          restSec: s.restSec,
          isPr: s.isPr
        })),
        cardio: bout
          ? {
              id: bout.id,
              durationSec: bout.durationSec,
              distance: bout.distance != null ? Number(bout.distance) : null,
              avgPaceSec: bout.avgPaceSec,
              avgHr: bout.avgHr,
              zones: bout.segments?.length ? zoneAggregates(bout.segments) : null
            }
          : null
      };
    })
  );

  return { ...base, entries };
}

/** Delete a workout (and its entries/sets/bouts via cascade). Owner-scoped. */
export async function deleteWorkout(userId: string, workoutId: string) {
  const rows = await db
    .delete(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .returning({ id: workouts.id });
  return rows.length > 0;
}

/** Add an exercise to a workout, snapshotting the goal in effect. */
export async function addExercise(
  workoutId: string,
  exerciseId: string,
  goalSnapshot: Goal,
  orderIndex: number
) {
  const [row] = await db
    .insert(workoutExercises)
    .values({ workoutId, exerciseId, goalSnapshot, orderIndex })
    .returning();
  return row;
}
