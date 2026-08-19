import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { logSet } from '$lib/server/services/sets';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
  requireUser(locals);
  const body = await request.json().catch(() => ({}));
  if (!body.workoutExerciseId || typeof body.reps !== 'number') {
    throw error(400, 'workoutExerciseId and reps are required');
  }
  const row = await logSet(body);
  return json(row, { status: 201 });
};
