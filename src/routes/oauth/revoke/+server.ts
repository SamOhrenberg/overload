import { revokeToken } from '$lib/server/auth/oauth';
import { readBody } from '$lib/server/oauthHttp';
import type { RequestHandler } from './$types';

/** RFC 7009 token revocation. Always 200, per spec. */
export const POST: RequestHandler = async ({ request }) => {
  const body = await readBody(request);
  if (typeof body.token === 'string' && body.token) await revokeToken(body.token);
  return new Response(null, { status: 200 });
};
