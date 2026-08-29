import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { cardioBouts, workoutExercises, workouts } from '$lib/server/db/schema';

export type CardioInput = {
  workoutExerciseId: string;
  durationSec: number;
  distance?: number | null;
  avgPaceSec?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  intervals?: Array<{ workSec: number; restSec: number; pace?: number; hr?: number }> | null;
  perceived?: number | null;
};

export async function logCardioBout(input: CardioInput) {
  // Derive pace from distance + duration when not supplied.
  let avgPaceSec = input.avgPaceSec ?? null;
  if (avgPaceSec == null && input.distance && input.distance > 0) {
    avgPaceSec = Math.round(input.durationSec / input.distance);
  }

  const [row] = await db
    .insert(cardioBouts)
    .values({
      workoutExerciseId: input.workoutExerciseId,
      durationSec: input.durationSec,
      distance: input.distance != null ? String(input.distance) : null,
      avgPaceSec,
      avgHr: input.avgHr ?? null,
      maxHr: input.maxHr ?? null,
      intervals: input.intervals ?? null,
      perceived: input.perceived ?? null
    })
    .returning();
  return row;
}

/** The most recent previous cardio bout for an exercise (engine input). */
export async function lastCardioBout(
  userId: string,
  exerciseId: string,
  excludeWorkoutId?: string
) {
  const [row] = await db
    .select({ bout: cardioBouts, performedAt: workouts.startedAt })
    .from(cardioBouts)
    .innerJoin(workoutExercises, eq(cardioBouts.workoutExerciseId, workoutExercises.id))
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

  return row ?? null;
}
