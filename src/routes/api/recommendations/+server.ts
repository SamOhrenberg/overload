import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import {
  getPendingRecommendations,
  getRecommendationsForPrefill,
  generateForExercise,
  setRecommendationStatus,
  updateRecommendationTarget
} from '$lib/server/services/recommendations';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireUser(locals);
  // scope=prefill → pending + accepted + modified (what the active workout
  // logger pre-fills from). Default → pending only (the Today/Targets backlog).
  if (url.searchParams.get('scope') === 'prefill') {
    return json(await getRecommendationsForPrefill(user.id));
  }
  return json(await getPendingRecommendations(user.id));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireUser(locals);
  const body = await request.json().catch(() => ({}));
  if (!body.exerciseId) return json({ error: 'exerciseId required' }, { status: 400 });
  const row = await generateForExercise(user.id, body.exerciseId);
  return json(row, { status: 201 });
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  const user = requireUser(locals);
  const body = await request.json().catch(() => ({}));
  if (!body.id) return json({ error: 'id required' }, { status: 400 });
  // An Adjust edit carries a new target; a plain Accept/skip carries a status.
  if (body.target && typeof body.target === 'object') {
    await updateRecommendationTarget(user.id, body.id, body.target);
  } else if (body.status) {
    await setRecommendationStatus(user.id, body.id, body.status);
  }
  return json({ ok: true });
};
