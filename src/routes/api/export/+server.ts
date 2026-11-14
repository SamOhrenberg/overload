import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { exportUserData } from '$lib/server/services/export';
import type { RequestHandler } from './$types';

/** Full, portable JSON export of a user's own data. */
export const GET: RequestHandler = async ({ locals }) => {
  const user = requireUser(locals);
  return json(await exportUserData(user), {
    headers: { 'Content-Disposition': 'attachment; filename="overload-export.json"' }
  });
};
