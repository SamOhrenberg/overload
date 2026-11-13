import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import {
  getGroupMemberIds,
  setMembership,
  setGroupMembers
} from '$lib/server/services/routines';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  return json(await getGroupMemberIds(user.id, params.id));
};

/**
 * Two shapes, both owner-checked server-side:
 *  - { exerciseIds: string[] }        → replace the whole membership set
 *  - { exerciseId: string, member }   → toggle one exercise in/out
 */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  const body = await request.json().catch(() => ({}));
  if (Array.isArray(body.exerciseIds)) {
    await setGroupMembers(user.id, params.id, body.exerciseIds);
  } else if (typeof body.exerciseId === 'string') {
    await setMembership(user.id, params.id, body.exerciseId, body.member !== false);
  } else {
    throw error(400, 'exerciseIds or exerciseId required');
  }
  return json({ ok: true });
};
