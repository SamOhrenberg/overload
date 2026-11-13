import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { logCardioBout, ownedExerciseForEntry } from '$lib/server/services/cardio';
import { generateForExercise } from '$lib/server/services/recommendations';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireUser(locals);
  const body = await request.json().catch(() => ({}));
  const hasSegments = Array.isArray(body.segments) && body.segments.length > 0;
  if (!body.workoutExerciseId || (typeof body.durationSec !== 'number' && !hasSegments)) {
    throw error(400, 'workoutExerciseId and durationSec (or segments) are required');
  }
  const row = await logCardioBout(body);

  // Refresh this exercise's next-session target from the bout just logged. This
  // also self-heals a run that was delivered late (e.g. queued offline while the
  // server was redeploying, then flushed after the workout was finished) — which
  // would otherwise leave the recommendation stuck on its cold-start baseline.
  const owned = await ownedExerciseForEntry(user.id, body.workoutExerciseId);
  if (owned) await generateForExercise(user.id, owned.exerciseId).catch(() => {});

  return json(row, { status: 201 });
};
