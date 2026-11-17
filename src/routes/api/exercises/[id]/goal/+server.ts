import { json, error } from '@sveltejs/kit';
import { parseBody, requireUser } from '$lib/server/http';
import { clearGoal, getActiveGoal, setGoal } from '$lib/server/services/goals';
import { getVisibleExercise } from '$lib/server/services/exercises';
import { readGoal } from '$lib/server/services/exerciseInput';
import { generateForExercise } from '$lib/server/services/recommendations';
import type { RequestHandler } from './$types';

async function visible(userId: string, id: string) {
  if (!(await getVisibleExercise(userId, id))) throw error(404, 'Exercise not found');
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  await visible(user.id, params.id);
  return json(await getActiveGoal(user.id, params.id));
};

/** Set your goal for an exercise; the next-session target is recomputed. */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  await visible(user.id, params.id);
  const { goal, opts } = await parseBody(request, (r) => readGoal(r));
  const row = await setGoal(user.id, params.id, goal, opts);
  await generateForExercise(user.id, params.id);
  return json(row);
};

/** Drop your goal so the exercise's default applies again. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  await visible(user.id, params.id);
  await clearGoal(user.id, params.id);
  await generateForExercise(user.id, params.id);
  return json({ ok: true });
};
