import { loadJson } from '$lib/client/load';
import type { LayoutLoad } from './$types';

export type User = { id: string; username: string; role: string; defaultUnit: string };

export const load: LayoutLoad = async () => {
  const { user } = await loadJson<{ user: User }>('/api/auth/me');
  return { user };
};
