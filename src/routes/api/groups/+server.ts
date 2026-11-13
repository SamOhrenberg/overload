import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { listGroups, createGroup } from '$lib/server/services/routines';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireUser(locals);
  return json(await listGroups(user.id));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireUser(locals);
  const body = await request.json().catch(() => ({}));
  if (!body.name || typeof body.name !== 'string') throw error(400, 'name is required');
  const row = await createGroup(user.id, {
    name: body.name,
    color: body.color ?? null,
    icon: body.icon ?? null
  });
  return json(row, { status: 201 });
};
