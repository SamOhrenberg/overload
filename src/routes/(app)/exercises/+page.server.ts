import { listExercises } from '$lib/server/services/exercises';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user!;
  return { exercises: await listExercises(user.id) };
};
