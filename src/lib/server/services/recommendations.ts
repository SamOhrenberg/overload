import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { recommendations, exercises, workoutExercises } from '$lib/server/db/schema';
import { getActiveGoal } from './goals';
import { lastWorkingSets } from './sets';
import { lastCardioBout } from './cardio';
import { buildRecommendation } from '$lib/server/engine/recommend';
import type { GoalConfig } from '$lib/server/engine/types';

/**
 * Compute and persist the next-session recommendation for one exercise.
 * Supersedes any prior pending recommendation for that exercise.
 */
export async function generateForExercise(
  userId: string,
  exerciseId: string,
  excludeWorkoutId?: string
) {
  const [exercise] = await db.select().from(exercises).where(eq(exercises.id, exerciseId));
  if (!exercise) return null;

  const goal = await getActiveGoal(userId, exerciseId);
  const effectiveGoal = goal?.goal ?? exercise.defaultGoal ?? 'strength';

  const cfg: GoalConfig = {
    goal: effectiveGoal,
    staminaMode: goal?.staminaMode ?? (exercise.kind === 'cardio' ? 'cardio' : 'work_capacity'),
    repLow: goal?.repLow ?? null,
    repHigh: goal?.repHigh ?? null,
    targetSets: goal?.targetSets ?? 3,
    targetRir: goal?.targetRir ?? 2,
    loadIncrement: exercise.loadIncrement != null ? Number(exercise.loadIncrement) : null,
    cardioMetric: goal?.cardioMetric ?? 'distance'
  };

  const isCardio = effectiveGoal === 'stamina' && cfg.staminaMode === 'cardio';
  let rec;
  if (isCardio) {
    const last = await lastCardioBout(userId, exerciseId, excludeWorkoutId);
    rec = buildRecommendation({
      cfg,
      lastCardio: last
        ? {
            durationSec: last.bout.durationSec,
            distance: last.bout.distance != null ? Number(last.bout.distance) : null,
            avgPaceSec: last.bout.avgPaceSec,
            avgHr: last.bout.avgHr
          }
        : null
    });
  } else {
    const last = await lastWorkingSets(userId, exerciseId, excludeWorkoutId);
    rec = buildRecommendation({
      cfg,
      lastSets: last.sets.map((s) => ({
        weight: s.weight != null ? Number(s.weight) : null,
        reps: s.reps,
        rir: s.rir
      }))
    });
  }

  // Replace any prior pending recommendation for this exercise.
  await db
    .delete(recommendations)
    .where(
      and(
        eq(recommendations.userId, userId),
        eq(recommendations.exerciseId, exerciseId),
        eq(recommendations.status, 'pending')
      )
    );

  const [row] = await db
    .insert(recommendations)
    .values({
      userId,
      exerciseId,
      goal: rec.goal,
      target: rec.target,
      rationale: rec.rationale,
      basis: rec.basis,
      status: 'pending'
    })
    .returning();
  return row;
}

/**
 * Regenerate recommendations for every exercise performed in a workout.
 * Called when a workout is finished — the just-logged session becomes the
 * basis for next time.
 */
export async function generateForWorkout(userId: string, workoutId: string) {
  const entries = await db
    .selectDistinct({ exerciseId: workoutExercises.exerciseId })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId));

  const out = [];
  for (const { exerciseId } of entries) {
    const row = await generateForExercise(userId, exerciseId);
    if (row) out.push(row);
  }
  return out;
}

/** Pending recommendations for the Today screen, with exercise names. */
export async function getPendingRecommendations(userId: string) {
  return db
    .select({
      id: recommendations.id,
      exerciseId: recommendations.exerciseId,
      name: exercises.name,
      unit: exercises.unit,
      goal: recommendations.goal,
      target: recommendations.target,
      rationale: recommendations.rationale,
      generatedAt: recommendations.generatedAt
    })
    .from(recommendations)
    .innerJoin(exercises, eq(recommendations.exerciseId, exercises.id))
    .where(and(eq(recommendations.userId, userId), eq(recommendations.status, 'pending')))
    .orderBy(desc(recommendations.generatedAt));
}

export async function setRecommendationStatus(
  userId: string,
  id: string,
  status: 'accepted' | 'modified' | 'skipped'
) {
  await db
    .update(recommendations)
    .set({ status })
    .where(and(eq(recommendations.id, id), eq(recommendations.userId, userId)));
}
