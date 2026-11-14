import { json } from '@sveltejs/kit';
import { getClient, issueTokens, parseScope, redeemCode, refreshTokens } from '$lib/server/auth/oauth';
import { oauthError, readBody } from '$lib/server/oauthHttp';
import { rateLimit } from '$lib/server/ratelimit';
import type { RequestHandler } from './$types';

/** OAuth token endpoint: authorization_code (PKCE) and refresh_token grants. */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  if (!rateLimit(`oauth-token:${getClientAddress()}`, 60, 60_000)) {
    return oauthError('slow_down', 'Too many requests.', 429);
  }
  const body = await readBody(request);
  const s = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');

  const clientId = s('client_id');
  const client = clientId ? await getClient(clientId) : null;
  if (!client) return oauthError('invalid_client', 'Unknown client_id.', 401);

  const noStore = { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } };

  if (s('grant_type') === 'authorization_code') {
    const row = await redeemCode({
      code: s('code'),
      clientId,
      redirectUri: s('redirect_uri'),
      codeVerifier: s('code_verifier')
    });
    if (!row) return oauthError('invalid_grant', 'Invalid, expired or already-used authorization code.');
    const tokens = await issueTokens({
      clientId,
      userId: row.userId,
      scope: row.scope,
      resource: row.resource
    });
    return json(tokens, noStore);
  }

  if (s('grant_type') === 'refresh_token') {
    const scope = s('scope') ? parseScope(s('scope')) : undefined;
    const tokens = await refreshTokens(s('refresh_token'), clientId, scope);
    if (!tokens) return oauthError('invalid_grant', 'Invalid or expired refresh token.');
    return json(tokens, noStore);
  }

  return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
};
