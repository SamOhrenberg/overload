import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { updateSet, deleteSet } from '$lib/server/services/sets';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  requireUser(locals);
  const body = await request.json().catch(() => ({}));
  const row = await updateSet(params.id, body);
  return json(row);
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  requireUser(locals);
  await deleteSet(params.id);
  return new Response(null, { status: 204 });
};
