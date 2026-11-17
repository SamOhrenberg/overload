import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import {
  todayView,
  exercisesView,
  exerciseDetailView,
  exerciseEditView,
  historyView,
  routinesView,
  targetsView,
  workoutView,
  workoutSummaryView
} from '$lib/server/views';
import type { RequestHandler } from './$types';

/**
 * Screen view-models for the static UI, one per page:
 *   /api/view/today, /exercises, /exercises/:id, /exercises/:id/edit, /history, /routines,
 *   /targets, /workouts/:id, /workouts/:id/summary
 */
export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  const seg = params.path.split('/').filter(Boolean);
  const [a, b, c] = seg;

  if (seg.length === 1) {
    if (a === 'today') return json(await todayView(user));
    if (a === 'exercises') return json(await exercisesView(user));
    if (a === 'history') return json(await historyView(user));
    if (a === 'routines') return json(await routinesView(user));
    if (a === 'targets') return json(await targetsView(user));
  }
  if (seg.length === 2 && a === 'exercises') return json(await exerciseDetailView(user, b));
  if (seg.length === 3 && a === 'exercises' && c === 'edit') return json(await exerciseEditView(user, b));
  if (seg.length === 2 && a === 'workouts') return json(await workoutView(user, b));
  if (seg.length === 3 && a === 'workouts' && c === 'summary') {
    return json(await workoutSummaryView(user, b));
  }
  throw error(404, 'Unknown view');
};
