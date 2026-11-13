import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { workouts, workoutExercises, sets, cardioBouts, exercises } from '$lib/server/db/schema';
import { bestEstimated1RM } from '$lib/server/engine/oneRepMax';
import { zoneAggregates } from '$lib/server/engine/runZones';
import { clock, zoneLabelsFor } from '$lib/format';
import type { RunZonePerf } from '$lib/server/engine/types';

export type SessionPoint = {
  workoutId: string;
  performedAt: Date;
  topSet: { weight: number | null; reps: number } | null;
  estimated1RM: number | null;
  totalVolume: number | null;
  distance: number | null;
  avgPaceSec: number | null;
  avgHr: number | null;
  zones: RunZonePerf | null;
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
      avgHr: bout?.avgHr ?? null,
      zones: bout?.segments?.length ? zoneAggregates(bout.segments) : null
    });
  }

  return points;
}

/**
 * Most recent performed timestamp per exercise for a user (one grouped query).
 * Powers the Targets "Due" recency model. Exercises never trained are simply
 * absent from the map.
 */
export async function lastPerformedByExercise(userId: string): Promise<Map<string, Date>> {
  const rows = await db
    .select({
      exerciseId: workoutExercises.exerciseId,
      last: sql<string>`max(${workouts.startedAt})`
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(workouts.userId, userId))
    .groupBy(workoutExercises.exerciseId);
  const map = new Map<string, Date>();
  for (const r of rows) if (r.last) map.set(r.exerciseId, new Date(r.last));
  return map;
}

/**
 * Compact "last session" summary per exercise, for the ExerciseCard subtitle.
 * e.g. "185 × 5" (top set of a lift), "jog 5:00 · 3×1:01" (zoned run), or
 * "3.1 mi" / "20 min" for other cardio. Three queries regardless of how many
 * ids are passed: the latest entry per exercise, then its sets and bouts.
 */
export async function lastSummaryForExercises(
  userId: string,
  ids: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;

  // Exercise meta (name drives zone labels, unit drives distance labels).
  const meta = await db
    .select({ id: exercises.id, name: exercises.name, unit: exercises.unit })
    .from(exercises)
    .where(inArray(exercises.id, ids));
  const metaById = new Map(meta.map((m) => [m.id, m]));

  // Latest workout-exercise entry per exercise (newest first, keep the first).
  const entries = await db
    .select({
      entryId: workoutExercises.id,
      exerciseId: workoutExercises.exerciseId,
      startedAt: workouts.startedAt
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(eq(workouts.userId, userId), inArray(workoutExercises.exerciseId, ids)))
    .orderBy(desc(workouts.startedAt));

  const latestEntry = new Map<string, string>(); // exerciseId -> entryId
  const entryExercise = new Map<string, string>(); // entryId -> exerciseId
  for (const e of entries) {
    if (latestEntry.has(e.exerciseId)) continue;
    latestEntry.set(e.exerciseId, e.entryId);
    entryExercise.set(e.entryId, e.exerciseId);
  }
  const entryIds = [...latestEntry.values()];
  if (!entryIds.length) return out;

  const [workSets, bouts] = await Promise.all([
    db
      .select()
      .from(sets)
      .where(and(inArray(sets.workoutExerciseId, entryIds), eq(sets.isWarmup, false))),
    db.select().from(cardioBouts).where(inArray(cardioBouts.workoutExerciseId, entryIds))
  ]);

  // Bout summary wins when present (cardio), otherwise the heaviest working set.
  for (const b of bouts) {
    const exerciseId = entryExercise.get(b.workoutExerciseId);
    if (!exerciseId) continue;
    const m = metaById.get(exerciseId);
    const unit = m?.unit ?? '';
    if (b.segments?.length) {
      const z = zoneAggregates(b.segments);
      const labels = zoneLabelsFor(m?.name ?? '');
      out.set(
        exerciseId,
        `${labels.jog.toLowerCase()} ${clock(z.jogHoldSec)} · ${z.sprintReps}×${clock(z.sprintIntervalSec)}`
      );
    } else if (b.distance != null) {
      out.set(exerciseId, `${Number(b.distance)} ${unit}`);
    } else {
      out.set(exerciseId, `${Math.round(b.durationSec / 60)} min`);
    }
  }

  const topByEntry = new Map<string, { weight: number | null; reps: number }>();
  for (const s of workSets) {
    const prev = topByEntry.get(s.workoutExerciseId);
    const weight = s.weight != null ? Number(s.weight) : null;
    if (!prev || (weight ?? 0) > (prev.weight ?? 0)) {
      topByEntry.set(s.workoutExerciseId, { weight, reps: s.reps });
    }
  }
  for (const [entryId, top] of topByEntry) {
    const exerciseId = entryExercise.get(entryId);
    if (!exerciseId || out.has(exerciseId)) continue; // bout summary already set
    out.set(exerciseId, top.weight != null ? `${top.weight} × ${top.reps}` : `${top.reps} reps`);
  }

  return out;
}
