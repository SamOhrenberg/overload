import { error } from '@sveltejs/kit';
import { listInvites } from '$lib/server/auth/invite';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.role !== 'admin') throw error(403, 'Admin only');
  return { invites: await listInvites() };
};
