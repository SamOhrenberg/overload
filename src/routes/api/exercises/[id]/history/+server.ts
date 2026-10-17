import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { exerciseHistory } from '$lib/server/services/history';
import { detectStall } from '$lib/server/engine/stall';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url }) => {
  const user = requireUser(locals);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100);
  const points = await exerciseHistory(user.id, params.id, limit);

  // Oldest → newest series of estimated 1RM for the stall check.
  const series = [...points]
    .reverse()
    .map((p) => p.estimated1RM)
    .filter((n): n is number => n != null);

  return json({ points, stall: detectStall(series) });
};
