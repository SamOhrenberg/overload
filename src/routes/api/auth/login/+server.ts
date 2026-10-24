import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession, generateSessionToken, setSessionCookie } from '$lib/server/auth/session';
import { rateLimit } from '$lib/server/ratelimit';
import type { RequestHandler } from './$types';

/**
 * JSON login for cross-origin clients (e.g. a GitHub Pages UI). Returns a
 * bearer token the client stores and sends as `Authorization: Bearer <token>`.
 * Also sets the session cookie for same-origin use.
 */
export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  if (!rateLimit(`login:${getClientAddress()}`, 10, 60_000)) {
    return json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');

  const [user] = await db.select().from(users).where(eq(users.username, username));
  const ok = user ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !ok) {
    return json({ error: 'Incorrect username or password.' }, { status: 401 });
  }

  const token = generateSessionToken();
  await createSession(token, user.id);
  setSessionCookie(cookies, token, !dev);

  return json({
    token,
    user: { id: user.id, username: user.username, role: user.role, defaultUnit: user.defaultUnit }
  });
};
