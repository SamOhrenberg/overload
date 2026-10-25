import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/http';
import { revokeInvite } from '$lib/server/auth/invite';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ locals, params }) => {
  requireAdmin(locals);
  await revokeInvite(params.id);
  return json({ ok: true });
};
