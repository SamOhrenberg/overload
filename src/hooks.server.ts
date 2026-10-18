import type { Handle } from '@sveltejs/kit';
import { readSessionCookie, validateSessionToken } from '$lib/server/auth/session';
import { bootstrap } from '$lib/server/bootstrap';
import { allowedOrigin, corsHeaders } from '$lib/server/cors';

export const handle: Handle = async ({ event, resolve }) => {
  await bootstrap();

  const origin = allowedOrigin(event.request.headers.get('origin'));

  // Answer CORS preflight for cross-origin API clients (e.g. GitHub Pages UI).
  if (event.request.method === 'OPTIONS' && origin) {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const token = readSessionCookie(event.cookies);
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
