import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { exercises } from '$lib/server/db/schema';
import { exerciseHistory } from '$lib/server/services/history';
import { getActiveGoal } from '$lib/server/services/goals';
import { detectStall } from '$lib/server/engine/stall';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = locals.user!;
  const [exercise] = await db.select().from(exercises).where(eq(exercises.id, params.id));
  if (!exercise) throw error(404, 'Exercise not found');

  const [points, goal] = await Promise.all([
    exerciseHistory(user.id, params.id, 30),
    getActiveGoal(user.id, params.id)
  ]);

  const series = [...points]
    .reverse()
    .map((p) => p.estimated1RM)
    .filter((n): n is number => n != null);

  return {
    exercise: {
      id: exercise.id,
      name: exercise.name,
      unit: exercise.unit,
      modality: exercise.modality
    },
    goal: goal?.goal ?? exercise.defaultGoal ?? 'strength',
    points,
    stall: detectStall(series)
  };
};
