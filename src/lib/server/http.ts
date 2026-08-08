import { error } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth/session';

/** Require an authenticated user in a server route, or throw 401. */
export function requireUser(locals: App.Locals): SessionUser {
  if (!locals.user) throw error(401, 'Not authenticated');
  return locals.user;
}

/** Require an admin, or throw 403. */
export function requireAdmin(locals: App.Locals): SessionUser {
  const user = requireUser(locals);
  if (user.role !== 'admin') throw error(403, 'Admin only');
  return user;
}
