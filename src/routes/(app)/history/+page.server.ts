import { listWorkouts } from '$lib/server/services/workouts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user!;
  const workouts = await listWorkouts(user.id, 60);
  return { workouts };
};
