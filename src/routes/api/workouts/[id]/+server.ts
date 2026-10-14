import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { getWorkout, finishWorkout, addExercise } from '$lib/server/services/workouts';
import { detectPrsForWorkout } from '$lib/server/services/prs';
import { generateForWorkout } from '$lib/server/services/recommendations';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  const workout = await getWorkout(user.id, params.id);
  if (!workout) throw error(404, 'Workout not found');
  return json(workout);
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  const body = await request.json().catch(() => ({}));
  const row = await finishWorkout(user.id, params.id, {
    notes: body.notes ?? null,
    sessionRpe: body.sessionRpe ?? null,
    readiness: body.readiness ?? null
  });
  if (!row) throw error(404, 'Workout not found');

  // Finishing a workout triggers PR detection and fresh recommendations.
  const prs = await detectPrsForWorkout(user.id, params.id);
  const recommendations = await generateForWorkout(user.id, params.id);
  return json({ workout: row, prs, recommendations });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
  requireUser(locals);
  const body = await request.json().catch(() => ({}));
  if (!body.exerciseId || !body.goalSnapshot) throw error(400, 'exerciseId and goalSnapshot required');
  const row = await addExercise(params.id, body.exerciseId, body.goalSnapshot, body.orderIndex ?? 0);
  return json(row, { status: 201 });
};
