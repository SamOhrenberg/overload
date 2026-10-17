import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { listExercises, createExercise } from '$lib/server/services/exercises';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireUser(locals);
  return json(await listExercises(user.id));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireUser(locals);
  const body = await request.json().catch(() => ({}));
  if (!body.name || !body.modality) throw error(400, 'name and modality are required');
  const row = await createExercise(user.id, body);
  return json(row, { status: 201 });
};
