import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession, generateSessionToken, setSessionCookie } from '$lib/server/auth/session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) redirect(303, '/');
  return {};
};

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const username = String(data.get('username') ?? '').trim();
    const password = String(data.get('password') ?? '');

    if (!username || !password) {
      return fail(400, { error: 'Enter your username and password.' });
    }

    const [user] = await db.select().from(users).where(eq(users.username, username));
    // Always run a verify to blunt timing/enumeration differences.
    const ok = user ? await verifyPassword(user.passwordHash, password) : false;
    if (!user || !ok) {
      return fail(400, { error: 'Incorrect username or password.' });
    }

    const token = generateSessionToken();
    await createSession(token, user.id);
    setSessionCookie(cookies, token, !dev);

    redirect(303, '/');
  }
};
