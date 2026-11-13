import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { updateGroup, deleteGroup } from '$lib/server/services/routines';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  const body = await request.json().catch(() => ({}));
  await updateGroup(user.id, params.id, {
    name: body.name,
    color: body.color,
    icon: body.icon
  });
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  await deleteGroup(user.id, params.id);
  return json({ ok: true });
};
