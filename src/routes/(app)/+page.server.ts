import { getPendingRecommendations } from '$lib/server/services/recommendations';
import { listWorkouts } from '$lib/server/services/workouts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user!;
  const [recommendations, recent] = await Promise.all([
    getPendingRecommendations(user.id),
    listWorkouts(user.id, 5)
  ]);
  return { recommendations, recentCount: recent.length };
};
