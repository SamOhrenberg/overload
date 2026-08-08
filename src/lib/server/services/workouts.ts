import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { workouts, workoutExercises, exercises } from '$lib/server/db/schema';
import type { Goal } from '$lib/server/db/schema';

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
