import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { cardioBouts, workoutExercises, workouts } from '$lib/server/db/schema';
import type { RunSegment } from '$lib/server/db/schema';

export type CardioInput = {
  workoutExerciseId: string;
  durationSec: number;
  distance?: number | null;
  avgPaceSec?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  intervals?: Array<{ workSec: number; restSec: number; pace?: number; hr?: number }> | null;
  segments?: RunSegment[] | null;
  perceived?: number | null;
};

export async function logCardioBout(input: CardioInput) {
  const [row] = await db.insert(cardioBouts).values(cardioRow(input)).returning();
  return row;
}

/** Normalize a cardio input into a cardio_bouts row (derives duration/pace). */
export function cardioRow(input: CardioInput): typeof cardioBouts.$inferInsert {
  const segments = input.segments?.length ? input.segments : null;

  // A zoned run's total time is the sum of its segments when not given directly.
  let durationSec = input.durationSec;
  if ((!durationSec || durationSec <= 0) && segments) {
    durationSec = segments.reduce((n, s) => n + (s.durationSec || 0), 0);
  }

  // Derive pace from distance + duration when not supplied.
  let avgPaceSec = input.avgPaceSec ?? null;
  if (avgPaceSec == null && input.distance && input.distance > 0) {
    avgPaceSec = Math.round(durationSec / input.distance);
  }

  return {
    workoutExerciseId: input.workoutExerciseId,
    durationSec,
    distance: input.distance != null ? String(input.distance) : null,
    avgPaceSec,
    avgHr: input.avgHr ?? null,
    maxHr: input.maxHr ?? null,
    intervals: input.intervals ?? null,
    segments,
    perceived: input.perceived ?? null
  };
}

/**
 * Resolve the owning user and exercise for a workout-exercise row, verifying
 * the row belongs to `userId`. Returns null if it does not (or is missing).
 */
export async function ownedExerciseForEntry(userId: string, workoutExerciseId: string) {
  const [row] = await db
    .select({ exerciseId: workoutExercises.exerciseId, userId: workouts.userId })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(workoutExercises.id, workoutExerciseId))
    .limit(1);
  if (!row || row.userId !== userId) return null;
  return { exerciseId: row.exerciseId };
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
