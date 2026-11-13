import { error } from '@sveltejs/kit';
import { getWorkoutDetail } from '$lib/server/services/workouts';
import { getPendingRecommendations } from '$lib/server/services/recommendations';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = locals.user!;
  const workout = await getWorkoutDetail(user.id, params.id);
  if (!workout) throw error(404, 'Workout not found');

  const exerciseIds = new Set(workout.entries.map((e) => e.exerciseId));
  const allRecs = await getPendingRecommendations(user.id);
  const recommendations = allRecs.filter((r) => exerciseIds.has(r.exerciseId));

  // Zone breakdown of any speed-zoned run(s) in this session.
  const runs = workout.entries
    .filter((e) => e.kind === 'cardio' && e.cardio?.zones)
    .map((e) => ({ name: e.name, zones: e.cardio!.zones! }));

  const durationMin =
    workout.endedAt && workout.startedAt
      ? Math.round((new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) / 60000)
      : null;

  return {
    title: workout.title,
    exerciseCount: workout.entries.length,
    durationMin,
    recommendations,
    runs
  };
};
