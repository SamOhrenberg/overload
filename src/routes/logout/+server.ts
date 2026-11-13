import { redirect } from '@sveltejs/kit';
import { deleteSessionCookie, invalidateSession } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies, url }) => {
  if (locals.sessionId) await invalidateSession(locals.sessionId);
  deleteSessionCookie(cookies, url.protocol === 'https:');
  redirect(303, '/login');
};
