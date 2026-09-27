import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { workouts, workoutExercises, sets, cardioBouts } from '$lib/server/db/schema';
import { bestEstimated1RM } from '$lib/server/engine/oneRepMax';

export type SessionPoint = {
  workoutId: string;
  performedAt: Date;
  topSet: { weight: number | null; reps: number } | null;
  estimated1RM: number | null;
  totalVolume: number | null;
  distance: number | null;
  avgPaceSec: number | null;
  avgHr: number | null;
};

/**
 * Per-session history for one exercise, newest first, with the derived
 * metrics the trend charts plot (est 1RM, volume, pace-at-HR).
 */
export async function exerciseHistory(
  userId: string,
  exerciseId: string,
  limit = 20
): Promise<SessionPoint[]> {
  const entries = await db
    .select({
      entryId: workoutExercises.id,
      workoutId: workouts.id,
      performedAt: workouts.startedAt
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(eq(workouts.userId, userId), eq(workoutExercises.exerciseId, exerciseId)))
    .orderBy(desc(workouts.startedAt))
    .limit(limit);

  const points: SessionPoint[] = [];

  for (const e of entries) {
    const workSets = await db
      .select()
      .from(sets)
      .where(and(eq(sets.workoutExerciseId, e.entryId), eq(sets.isWarmup, false)))
      .orderBy(sets.setIndex);

    const [bout] = await db
      .select()
      .from(cardioBouts)
      .where(eq(cardioBouts.workoutExerciseId, e.entryId))
      .limit(1);

    let topSet: SessionPoint['topSet'] = null;
    let totalVolume: number | null = null;
    if (workSets.length) {
      const mapped = workSets.map((s) => ({
        weight: s.weight != null ? Number(s.weight) : null,
        reps: s.reps,
        isWarmup: s.isWarmup
      }));
      totalVolume = mapped.reduce((sum, s) => sum + (s.weight ?? 0) * s.reps, 0);
      const heaviest = mapped.reduce((a, b) => ((b.weight ?? 0) > (a.weight ?? 0) ? b : a));
      topSet = { weight: heaviest.weight, reps: heaviest.reps };
    }

    points.push({
      workoutId: e.workoutId,
      performedAt: e.performedAt,
      topSet,
      estimated1RM: workSets.length ? Math.round(bestEstimated1RM(workSets.map((s) => ({
        weight: s.weight != null ? Number(s.weight) : null,
        reps: s.reps,
        isWarmup: s.isWarmup
      }))) * 10) / 10 : null,
      totalVolume,
      distance: bout?.distance != null ? Number(bout.distance) : null,
      avgPaceSec: bout?.avgPaceSec ?? null,
      avgHr: bout?.avgHr ?? null
    });
  }

  return points;
}
