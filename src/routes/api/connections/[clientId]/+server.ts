import { requireUser } from '$lib/server/http';
import { revokeConnection } from '$lib/server/auth/oauth';
import type { RequestHandler } from './$types';

/** Disconnect an app: revoke all of its tokens and pending codes for this user. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  await revokeConnection(user.id, params.clientId);
  return new Response(null, { status: 204 });
};
