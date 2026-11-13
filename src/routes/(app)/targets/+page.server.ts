import {
  getPendingRecommendations,
  getRecommendationsForPrefill
} from '$lib/server/services/recommendations';
import { exercisesInAnyGroup } from '$lib/server/services/routines';
import {
  lastPerformedByExercise,
  lastSummaryForExercises
} from '$lib/server/services/history';
import { targetLabel } from '$lib/format';
import type { PageServerLoad } from './$types';

export type TargetRow = {
  exerciseId: string;
  recId: string | null;
  name: string;
  unit: string;
  goal: 'strength' | 'endurance' | 'stamina';
  target: string;
  rawTarget: Record<string, unknown> | null;
  rationale: string | null;
  lastSummary: string | null;
  lastPerformed: string | null;
};

/**
 * Targets tab, two sub-views:
 *  - Due: exercises in at least one of the user's groups that have been trained
 *    at least once, sorted by longest-since-trained. Never-trained exercises are
 *    NOT due (nothing is "overdue" until you've done it once); they surface via
 *    the routine on Today instead. Scoping to grouped exercises also keeps random
 *    one-off logs from nagging forever.
 *  - All: the full pending-target backlog (newest first), tidied behind a
 *    disclosure on the client.
 */
export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user!;

  const [pending, prefill, lastMap, grouped] = await Promise.all([
    getPendingRecommendations(user.id),
    getRecommendationsForPrefill(user.id),
    lastPerformedByExercise(user.id),
    exercisesInAnyGroup(user.id)
  ]);

  const recByEx = new Map(prefill.map((r) => [r.exerciseId, r]));
  const ids = Array.from(new Set([...grouped.map((e) => e.id), ...pending.map((p) => p.exerciseId)]));
  const summaries = await lastSummaryForExercises(user.id, ids);

  const due: TargetRow[] = grouped
    .map((e) => {
      const rec = recByEx.get(e.id);
      const last = lastMap.get(e.id) ?? null;
      return {
        exerciseId: e.id,
        recId: rec?.id ?? null,
        name: e.name,
        unit: e.unit,
        goal: rec?.goal ?? e.defaultGoal ?? 'strength',
        target: rec ? targetLabel(rec.target, e.unit, e.name) : 'Set a baseline',
        rawTarget: rec?.target ?? null,
        rationale: rec?.rationale ?? null,
        lastSummary: summaries.get(e.id) ?? null,
        lastPerformed: last ? last.toISOString() : null
      };
    })
    // Only things trained at least once can be "due".
    .filter((r) => r.lastPerformed != null)
    // Longest-since-trained first.
    .sort(
      (a, b) => new Date(a.lastPerformed!).getTime() - new Date(b.lastPerformed!).getTime()
    );

  const all: TargetRow[] = pending.map((r) => ({
    exerciseId: r.exerciseId,
    recId: r.id,
    name: r.name,
    unit: r.unit,
    goal: r.goal,
    target: targetLabel(r.target, r.unit, r.name),
    rawTarget: r.target,
    rationale: r.rationale,
    lastSummary: summaries.get(r.exerciseId) ?? null,
    lastPerformed: lastMap.get(r.exerciseId)?.toISOString() ?? null
  }));

  return { due, all };
};
