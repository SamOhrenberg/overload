import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  // Same-origin self-hosted guard. Cross-origin clients authenticate with a
  // bearer token and handle their own routing.
  if (!locals.user) redirect(303, '/login');
  return { user: locals.user };
};
