import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { startWorkout, listWorkouts } from '$lib/server/services/workouts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireUser(locals);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100);
  return json(await listWorkouts(user.id, limit));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireUser(locals);
  const body = await request.json().catch(() => ({}));
  const workout = await startWorkout(user.id, body.title ?? null);
  return json(workout, { status: 201 });
};
