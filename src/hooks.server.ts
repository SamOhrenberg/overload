import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { readSessionCookie, readBearerToken, validateSessionToken } from '$lib/server/auth/session';
import { bootstrap } from '$lib/server/bootstrap';
import { allowedOrigin, corsHeaders } from '$lib/server/cors';
import { env } from '$lib/server/config';
import { OPEN_CORS, isOpenCorsPath } from '$lib/server/oauthHttp';

const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];

function isCrossSiteFormPost(request: Request, url: URL): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return false;
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!FORM_TYPES.includes(type)) return false;
  const origin = request.headers.get('origin');
  if (origin === url.origin) return false;
  // Also accept the host the request actually arrived on (e.g. reached by LAN
  // IP while ORIGIN is the public URL). A browser never lets a foreign page
  // forge Origin, so this is still same-site.
  try {
    const host = request.headers.get('host');
    if (origin && host && new URL(origin).host === host) return false;
  } catch {
    /* malformed Origin → treat as cross-site */
  }
  return true;
}

export const handle: Handle = async ({ event, resolve }) => {
  // The static (GitHub Pages) build renders its app shell without a database.
  if (!building) await bootstrap();

  // CSRF: cross-site form posts are refused (SvelteKit's checkOrigin, moved here
  // so the OAuth endpoints below can be exempt — see svelte.config.js).
  if (isCrossSiteFormPost(event.request, event.url) && !isOpenCorsPath(event.url.pathname)) {
    return new Response('Cross-site POST form submissions are forbidden', { status: 403 });
  }

  // OAuth + MCP endpoints authenticate by bearer token only (never cookies), so
  // any origin may call them — browser-based MCP clients need this.
  if (isOpenCorsPath(event.url.pathname)) {
    if (event.request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: OPEN_CORS });
    }
    event.locals.user = null;
    event.locals.sessionId = null;
    const response = await resolve(event);
    for (const [k, v] of Object.entries(OPEN_CORS)) response.headers.set(k, v);
    return response;
  }

  const origin = allowedOrigin(event.request.headers.get('origin'));

  // Answer CORS preflight for cross-origin API clients (e.g. GitHub Pages UI).
  if (event.request.method === 'OPTIONS' && origin) {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const token =
    readSessionCookie(event.cookies) ??
    (env.AUTH_TOKENS_ENABLED ? readBearerToken(event.request) : null);
  if (token) {
    const result = await validateSessionToken(token);
    event.locals.user = result?.user ?? null;
    event.locals.sessionId = result?.sessionId ?? null;
  } else {
    event.locals.user = null;
    event.locals.sessionId = null;
  }

  const response = await resolve(event);
  if (origin) {
    for (const [k, v] of Object.entries(corsHeaders(origin))) response.headers.set(k, v);
  }
  return response;
};
