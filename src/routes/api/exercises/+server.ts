import { json, error } from '@sveltejs/kit';
import { parseBody, requireUser } from '$lib/server/http';
import { listExercises, createExercise, findExerciseByName } from '$lib/server/services/exercises';
import { readNewExercise } from '$lib/server/services/exerciseInput';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireUser(locals);
  return json(await listExercises(user.id));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireUser(locals);
  const input = await parseBody(request, readNewExercise);
  const dupe = await findExerciseByName(user.id, input.name);
  if (dupe) {
    throw error(409, `"${dupe.name}" already exists${dupe.isArchived ? ' (archived)' : ''}.`);
  }
  const row = await createExercise(user.id, {
    ...input,
    unit: input.unit ?? (input.modality === 'cardio' ? 'mi' : user.defaultUnit)
  });
  return json(row, { status: 201 });
};
