import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { exercises } from '$lib/server/db/schema';
import type { Goal } from '$lib/server/db/schema';

/** Built-in library plus this user's custom exercises (non-archived). */
export async function listExercises(userId: string) {
  return db
    .select()
    .from(exercises)
    .where(
      and(
        or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)),
        eq(exercises.isArchived, false)
      )
    )
    .orderBy(exercises.name);
}

export async function createExercise(
  userId: string,
  data: {
    name: string;
    modality: 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cardio';
    kind?: 'resistance' | 'cardio' | 'mobility';
    muscleGroups?: string[];
    unit?: 'lb' | 'kg' | 'km' | 'mi' | 'min';
    loadIncrement?: number | null;
    defaultGoal?: Goal | null;
  }
) {
  const kind = data.kind ?? (data.modality === 'cardio' ? 'cardio' : 'resistance');
  const [row] = await db
    .insert(exercises)
    .values({
      ownerId: userId,
      name: data.name.trim(),
      modality: data.modality,
      kind,
      muscleGroups: data.muscleGroups ?? [],
      unit: data.unit ?? 'lb',
      loadIncrement: data.loadIncrement != null ? String(data.loadIncrement) : null,
      defaultGoal: data.defaultGoal ?? null
    })
    .returning();
  return row;
}

export async function archiveExercise(userId: string, id: string) {
  await db
    .update(exercises)
    .set({ isArchived: true })
    .where(and(eq(exercises.id, id), eq(exercises.ownerId, userId)));
}
