import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { exerciseGoals } from '$lib/server/db/schema';
import type { Goal, StaminaMode } from '$lib/server/db/schema';
import { goalDefaults } from '$lib/exercise';

export { goalDefaults };

/** Drop the user's goal for an exercise so it falls back to the exercise default. */
export async function clearGoal(userId: string, exerciseId: string) {
  await db
    .update(exerciseGoals)
    .set({ active: false })
    .where(and(eq(exerciseGoals.userId, userId), eq(exerciseGoals.exerciseId, exerciseId)));
}

export async function getActiveGoal(userId: string, exerciseId: string) {
  const [row] = await db
    .select()
    .from(exerciseGoals)
    .where(
      and(
        eq(exerciseGoals.userId, userId),
        eq(exerciseGoals.exerciseId, exerciseId),
        eq(exerciseGoals.active, true)
      )
    );
  return row ?? null;
}

export async function setGoal(
  userId: string,
  exerciseId: string,
  goal: Goal,
  opts: {
    staminaMode?: StaminaMode;
    repLow?: number | null;
    repHigh?: number | null;
    targetSets?: number;
    targetRir?: number;
    cardioMetric?: 'duration' | 'distance' | 'pace' | null;
  } = {}
) {
  const defaults = goalDefaults(goal, opts.staminaMode);

  // Deactivate any prior goal, then insert the new active one.
  await db
    .update(exerciseGoals)
    .set({ active: false })
    .where(and(eq(exerciseGoals.userId, userId), eq(exerciseGoals.exerciseId, exerciseId)));

  const [row] = await db
    .insert(exerciseGoals)
    .values({
      userId,
      exerciseId,
      goal,
      staminaMode: opts.staminaMode ?? defaults.staminaMode,
      repLow: opts.repLow ?? defaults.repLow,
      repHigh: opts.repHigh ?? defaults.repHigh,
      targetSets: opts.targetSets ?? defaults.targetSets,
      targetRir: opts.targetRir ?? defaults.targetRir,
      cardioMetric: opts.cardioMetric ?? (goal === 'stamina' ? 'distance' : null),
      active: true
    })
    .returning();
  return row;
}
