import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import {
  getPendingRecommendations,
  generateForExercise,
  setRecommendationStatus
} from '$lib/server/services/recommendations';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireUser(locals);
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
  await setRecommendationStatus(user.id, body.id, body.status);
  return json({ ok: true });
};
