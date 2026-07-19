import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { hashPassword, validatePasswordStrength } from '$lib/server/auth/password';
import { validateInvite, consumeInvite } from '$lib/server/auth/invite';
import { createSession, generateSessionToken, setSessionCookie } from '$lib/server/auth/session';
import { env } from '$lib/server/config';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) redirect(303, '/');
  return {};
};

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const code = String(data.get('code') ?? '').trim();
    const username = String(data.get('username') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const values = { code, username };

    if (!code || !username || !password) {
      return fail(400, { ...values, error: 'All fields are required.' });
    }
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      return fail(400, { ...values, error: 'Username must be 3–32 letters, numbers, . _ -' });
    }
    const weak = validatePasswordStrength(password);
    if (weak) return fail(400, { ...values, error: weak });

    const invite = await validateInvite(code);
    if (!invite.ok) {
      return fail(400, { ...values, error: 'That invite code is not valid.' });
    }

    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (taken) return fail(400, { ...values, error: 'That username is taken.' });

    // Consume the invite first; if it was raced to exhaustion, stop.
    if (!(await consumeInvite(invite.id))) {
      return fail(400, { ...values, error: 'That invite code is no longer available.' });
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({ username, passwordHash, role: 'member', defaultUnit: env.DEFAULT_UNIT })
      .returning({ id: users.id });

    const token = generateSessionToken();
    await createSession(token, user.id);
    setSessionCookie(cookies, token, !dev);

    redirect(303, '/');
  }
};
