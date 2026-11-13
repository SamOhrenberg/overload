import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { hashPassword, validatePasswordStrength } from '$lib/server/auth/password';
import { validateInvite, consumeInvite } from '$lib/server/auth/invite';
import { createSession, generateSessionToken, setSessionCookie } from '$lib/server/auth/session';
import { ensureDefaultGroupsForUser } from '$lib/server/db/seed';
import { rateLimit } from '$lib/server/ratelimit';
import { env } from '$lib/server/config';
import type { RequestHandler } from './$types';

/**
 * JSON sign-up with an invite code. Like /api/auth/login, returns a bearer
 * token for cross-origin clients and also sets the same-origin session cookie.
 */
export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
  if (!rateLimit(`join:${getClientAddress()}`, 10, 60_000)) {
    return json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? '').trim();
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const fail = (msg: string) => json({ error: msg }, { status: 400 });

  if (!code || !username || !password) return fail('All fields are required.');
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return fail('Username must be 3–32 letters, numbers, . _ -');
  }
  const weak = validatePasswordStrength(password);
  if (weak) return fail(weak);

  const invite = await validateInvite(code);
  if (!invite.ok) return fail('That invite code is not valid.');

  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`);
  if (taken) return fail('That username is taken.');

  // Consume the invite first; if it was raced to exhaustion, stop.
  if (!(await consumeInvite(invite.id))) return fail('That invite code is no longer available.');

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ username, passwordHash, role: 'member', defaultUnit: env.DEFAULT_UNIT })
    .returning({ id: users.id, username: users.username, role: users.role, defaultUnit: users.defaultUnit });

  // Give new members a ready-made set of routine groups to start from.
  await ensureDefaultGroupsForUser(user.id);

  const token = generateSessionToken();
  await createSession(token, user.id);
  setSessionCookie(cookies, token, url.protocol === 'https:');

  return json({ token, user });
};
