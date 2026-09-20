import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  personalRecords,
  sets,
  cardioBouts,
  workoutExercises
} from '$lib/server/db/schema';
import { epley1RM } from '$lib/server/engine/oneRepMax';

type PrKind = 'est_1rm' | 'max_weight' | 'max_reps' | 'distance' | 'best_pace';

async function currentBest(userId: string, exerciseId: string, kind: PrKind): Promise<number | null> {
  const [row] = await db
    .select({ value: personalRecords.value })
    .from(personalRecords)
    .where(
      and(
        eq(personalRecords.userId, userId),
        eq(personalRecords.exerciseId, exerciseId),
        eq(personalRecords.kind, kind)
      )
    )
    .orderBy(desc(personalRecords.value))
    .limit(1);
  return row ? Number(row.value) : null;
}

async function record(userId: string, exerciseId: string, kind: PrKind, value: number, setId?: string) {
  await db
    .insert(personalRecords)
    .values({ userId, exerciseId, kind, value: String(value), sourceSetId: setId ?? null });
}

/**
 * Scan a finished workout and record any new PRs. Returns a list of the PRs
 * set, so the UI can celebrate them in the post-workout summary.
 */
export async function detectPrsForWorkout(userId: string, workoutId: string) {
  const entries = await db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId));

  const found: Array<{ exerciseId: string; kind: PrKind; value: number }> = [];

  for (const entry of entries) {
    // --- Resistance PRs ---
    const workSets = await db
      .select()
      .from(sets)
      .where(and(eq(sets.workoutExerciseId, entry.id), eq(sets.isWarmup, false)));

    for (const s of workSets) {
      const weight = s.weight != null ? Number(s.weight) : null;
      if (weight != null) {
        const est = epley1RM(weight, s.reps);
        const best1rm = await currentBest(userId, entry.exerciseId, 'est_1rm');
        if (best1rm == null || est > best1rm) {
          await record(userId, entry.exerciseId, 'est_1rm', est, s.id);
          await db.update(sets).set({ isPr: true }).where(eq(sets.id, s.id));
          found.push({ exerciseId: entry.exerciseId, kind: 'est_1rm', value: est });
        }
        const bestW = await currentBest(userId, entry.exerciseId, 'max_weight');
        if (bestW == null || weight > bestW) {
          await record(userId, entry.exerciseId, 'max_weight', weight, s.id);
          found.push({ exerciseId: entry.exerciseId, kind: 'max_weight', value: weight });
        }
      } else {
        // Bodyweight / timed: track max reps.
        const bestReps = await currentBest(userId, entry.exerciseId, 'max_reps');
        if (bestReps == null || s.reps > bestReps) {
          await record(userId, entry.exerciseId, 'max_reps', s.reps, s.id);
          found.push({ exerciseId: entry.exerciseId, kind: 'max_reps', value: s.reps });
        }
      }
    }

    // --- Cardio PRs ---
    const bouts = await db
      .select()
      .from(cardioBouts)
      .where(eq(cardioBouts.workoutExerciseId, entry.id));

    for (const b of bouts) {
      if (b.distance != null) {
        const dist = Number(b.distance);
        const bestDist = await currentBest(userId, entry.exerciseId, 'distance');
        if (bestDist == null || dist > bestDist) {
          await record(userId, entry.exerciseId, 'distance', dist);
          found.push({ exerciseId: entry.exerciseId, kind: 'distance', value: dist });
        }
      }
      if (b.avgPaceSec != null) {
        // Lower pace is better; store as negative so "max" semantics hold.
        const pace = b.avgPaceSec;
        const bestPace = await currentBest(userId, entry.exerciseId, 'best_pace');
        if (bestPace == null || -pace > bestPace) {
          await record(userId, entry.exerciseId, 'best_pace', -pace);
          found.push({ exerciseId: entry.exerciseId, kind: 'best_pace', value: pace });
        }
      }
    }
  }

  return found;
}
