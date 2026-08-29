import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { logCardioBout } from '$lib/server/services/cardio';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
  requireUser(locals);
  const body = await request.json().catch(() => ({}));
  if (!body.workoutExerciseId || typeof body.durationSec !== 'number') {
    throw error(400, 'workoutExerciseId and durationSec are required');
  }
  const row = await logCardioBout(body);
  return json(row, { status: 201 });
};
