import {
  getPendingRecommendations,
  getRecommendationsForPrefill
} from '$lib/server/services/recommendations';
import {
  resolveActiveGroups,
  exercisesForGroups,
  listGroups,
  getWeeklySchedule
} from '$lib/server/services/routines';
import { lastSummaryForExercises } from '$lib/server/services/history';
import { targetLabel, todayStr } from '$lib/format';
import type { PageServerLoad } from './$types';

export type TodayCard = {
  exerciseId: string;
  recId: string | null;
  name: string;
  unit: string;
  goal: 'strength' | 'endurance' | 'stamina';
  target: string;
  rawTarget: Record<string, unknown> | null;
  rationale: string | null;
  lastSummary: string | null;
  status: 'ready' | 'done';
  tracksSpeedZones: boolean;
};

/**
 * Today = the exercises in today's active group(s). Active groups come from the
 * day_plan override for today's date if any rows exist, else the weekday's
 * recurring schedule. Cards read their target from the prefill-scope
 * recommendations (pending + accepted + modified) so an accepted target still
 * shows here as "done" rather than reverting to a baseline.
 *
 * BACKLOG FALLBACK: when today has no active groups AND the user has no weekly
 * schedule at all (brand-new, or they have groups but haven't planned their
 * week yet), we fall back to the old behavior — every pending target — so Today
 * is never awkwardly empty. Once a weekly schedule exists, an unscheduled day is
 * a real rest day and shows the rest state instead.
 */
export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user!;
  const now = new Date();
  const date = todayStr(now);
  const dow = now.getDay();

  const [{ groups, source }, allGroups, schedule] = await Promise.all([
    resolveActiveGroups(user.id, date, dow),
    listGroups(user.id),
    getWeeklySchedule(user.id)
  ]);

  const hasGroups = allGroups.length > 0;
  const hasSchedule = Object.values(schedule).some((a) => a.length > 0);
  // 'routine' → today's groups drive the cards; 'backlog' → all pending targets
  // (no plan yet); 'rest' → scheduled rest day, nothing to show.
  const mode: 'routine' | 'backlog' | 'rest' =
    groups.length > 0 ? 'routine' : hasSchedule ? 'rest' : 'backlog';

  let cards: TodayCard[] = [];

  if (mode === 'routine') {
    const exList = await exercisesForGroups(groups.map((g) => g.id));
    const ids = exList.map((e) => e.id);
    const [recs, summaries] = await Promise.all([
      getRecommendationsForPrefill(user.id),
      lastSummaryForExercises(user.id, ids)
    ]);
    const recByEx = new Map(recs.map((r) => [r.exerciseId, r]));
    cards = exList.map((e) => {
      const rec = recByEx.get(e.id);
      const summary = summaries.get(e.id) ?? null;
      return {
        exerciseId: e.id,
        recId: rec?.id ?? null,
        name: e.name,
        unit: e.unit,
        goal: rec?.goal ?? e.defaultGoal ?? 'strength',
        target: rec ? targetLabel(rec.target, e.unit, e.name) : 'Set a baseline',
        rawTarget: rec?.target ?? null,
        rationale:
          rec?.rationale ?? (summary ? null : 'First session — log a set to start your trend.'),
        lastSummary: summary,
        status: rec?.status === 'accepted' ? 'done' : 'ready',
        tracksSpeedZones: e.tracksSpeedZones
      };
    });
  } else if (mode === 'backlog') {
    // No plan yet → old behavior: every pending target.
    const pending = await getPendingRecommendations(user.id);
    const summaries = await lastSummaryForExercises(
      user.id,
      pending.map((p) => p.exerciseId)
    );
    cards = pending.map((r) => ({
      exerciseId: r.exerciseId,
      recId: r.id,
      name: r.name,
      unit: r.unit,
      goal: r.goal,
      target: targetLabel(r.target, r.unit, r.name),
      rawTarget: r.target,
      rationale: r.rationale,
      lastSummary: summaries.get(r.exerciseId) ?? null,
      status: 'ready' as const,
      tracksSpeedZones: false
    }));
  }

  return {
    cards,
    activeGroups: groups,
    allGroups,
    mode,
    hasGroups,
    hasSchedule,
    swapped: source === 'day_plan',
    today: { date, dow }
  };
};
