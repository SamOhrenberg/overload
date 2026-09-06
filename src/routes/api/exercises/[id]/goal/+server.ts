import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { getActiveGoal, setGoal } from '$lib/server/services/goals';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  return json(await getActiveGoal(user.id, params.id));
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  const body = await request.json().catch(() => ({}));
  if (!['strength', 'endurance', 'stamina'].includes(body.goal)) {
    throw error(400, 'goal must be strength, endurance, or stamina');
  }
  const row = await setGoal(user.id, params.id, body.goal, body);
  return json(row);
};
