import { json, error } from '@sveltejs/kit';
import { parseBody, requireUser } from '$lib/server/http';
import {
  deleteExercise,
  findExerciseByName,
  getVisibleExercise,
  updateExercise
} from '$lib/server/services/exercises';
import { readExercisePatch } from '$lib/server/services/exerciseInput';
import type { RequestHandler } from './$types';

async function ownCustom(userId: string, id: string) {
  const ex = await getVisibleExercise(userId, id);
  if (!ex) throw error(404, 'Exercise not found');
  if (ex.ownerId == null) throw error(403, 'Built-in exercises can’t be edited');
  return ex;
}

/** Edit one of your own exercises. Only the fields sent change. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  await ownCustom(user.id, params.id);
  const patch = await parseBody(request, (r) => readExercisePatch(r));
  if (patch.name) {
    const dupe = await findExerciseByName(user.id, patch.name, params.id);
    if (dupe) throw error(409, `"${dupe.name}" already exists.`);
  }
  return json(await updateExercise(user.id, params.id, patch));
};

/** Delete one of your own exercises — archived instead if it has history. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  await ownCustom(user.id, params.id);
  return json({ result: await deleteExercise(user.id, params.id) });
};
