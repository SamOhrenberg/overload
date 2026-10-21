import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { deleteSessionCookie, invalidateSession } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies }) => {
  if (locals.sessionId) await invalidateSession(locals.sessionId);
  deleteSessionCookie(cookies, !dev);
  return json({ ok: true });
};
