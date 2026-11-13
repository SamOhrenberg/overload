import { error } from '@sveltejs/kit';
import { loadJson } from '$lib/client/load';
import type { listInvites } from '$lib/server/auth/invite';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { user } = await parent();
  if (user.role !== 'admin') error(403, 'Admin only');
  return { invites: await loadJson<Awaited<ReturnType<typeof listInvites>>>('/api/invites') };
};
