import { error } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth/session';
import { ArgReader, ToolError } from '$lib/server/mcp/args';

/**
 * Read a JSON object body and validate it with `parse`; validation errors
 * (ToolError) become a 400 carrying the message.
 */
export async function parseBody<T>(request: Request, parse: (r: ArgReader) => T | Promise<T>): Promise<T> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Expected a JSON object.');
  try {
    return await parse(new ArgReader(body as Record<string, unknown>));
  } catch (e) {
    if (e instanceof ToolError) throw error(400, e.message);
    throw e;
  }
}

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
