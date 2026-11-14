import { json } from '@sveltejs/kit';
import { ALL_SCOPES, isAcceptableRedirectUri, registerClient } from '$lib/server/auth/oauth';
import { oauthError } from '$lib/server/oauthHttp';
import { rateLimit } from '$lib/server/ratelimit';
import type { RequestHandler } from './$types';

/**
 * RFC 7591 dynamic client registration. Open (as MCP clients expect), but it
 * grants nothing by itself: every client still needs a user's consent.
 * All clients are public (PKCE, no secret).
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  if (!rateLimit(`oauth-register:${getClientAddress()}`, 20, 60 * 60_000)) {
    return oauthError('slow_down', 'Too many registrations.', 429);
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return oauthError('invalid_client_metadata', 'Expected a JSON body.');

  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!uris.length || uris.length > 10) {
    return oauthError('invalid_redirect_uri', 'Provide 1-10 redirect_uris.');
  }
  const bad = uris.find((u) => !isAcceptableRedirectUri(u));
  if (bad) return oauthError('invalid_redirect_uri', `Redirect URI not allowed: ${bad}`);

  const grantTypes = Array.isArray(body.grant_types)
    ? body.grant_types.map(String)
    : ['authorization_code'];
  if (grantTypes.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) {
    return oauthError(
      'invalid_client_metadata',
      'Only authorization_code and refresh_token grants are supported.'
    );
  }

  const client = await registerClient(String(body.client_name ?? 'MCP client'), uris);
  return json(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: ALL_SCOPES.join(' ')
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
};
