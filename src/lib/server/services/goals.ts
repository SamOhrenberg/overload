import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { exerciseGoals } from '$lib/server/db/schema';
import type { Goal, StaminaMode } from '$lib/server/db/schema';

/** Sensible defaults for each goal, used when a user first tags an exercise. */
export function goalDefaults(goal: Goal, staminaMode: StaminaMode = 'cardio') {
  switch (goal) {
    case 'strength':
      return { repLow: 3, repHigh: 6, targetSets: 3, targetRir: 2, staminaMode: null };
    case 'endurance':
      return { repLow: 12, repHigh: 20, targetSets: 3, targetRir: 1, staminaMode: null };
    case 'stamina':
      return staminaMode === 'work_capacity'
        ? { repLow: 15, repHigh: 30, targetSets: 3, targetRir: 1, staminaMode }
        : { repLow: null, repHigh: null, targetSets: 1, targetRir: 0, staminaMode };
  }
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
