import type { Handle } from '@sveltejs/kit';
import { readSessionCookie, validateSessionToken } from '$lib/server/auth/session';

export const handle: Handle = async ({ event, resolve }) => {
  const token = readSessionCookie(event.cookies);
  if (token) {
    const result = await validateSessionToken(token);
    event.locals.user = result?.user ?? null;
    event.locals.sessionId = result?.sessionId ?? null;
  } else {
    event.locals.user = null;
    event.locals.sessionId = null;
  }

  return resolve(event);
};
