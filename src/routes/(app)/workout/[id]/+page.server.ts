import { error } from '@sveltejs/kit';
import { getWorkoutDetail } from '$lib/server/services/workouts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = locals.user!;
  const workout = await getWorkoutDetail(user.id, params.id);
  if (!workout) throw error(404, 'Workout not found');

  const durationMin =
    workout.endedAt && workout.startedAt
      ? Math.round(
          (new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) / 60000
        )
      : null;

  const totalSets = workout.entries.reduce(
    (n, e) => n + e.sets.filter((s) => !s.isWarmup).length,
    0
  );

  return { workout, durationMin, totalSets };
};
