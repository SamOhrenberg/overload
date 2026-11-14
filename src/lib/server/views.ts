/**
 * Page view-models. Each function returns exactly what one screen renders; they
 * are served as JSON from /api/view/* so the UI can be a static client hosted
 * anywhere (home server or GitHub Pages) — see docs/09-deployment-and-client.md.
 */
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { exercises } from '$lib/server/db/schema';
import type { SessionUser } from '$lib/server/auth/session';
import {
  getPendingRecommendations,
  getRecommendationsForPrefill
} from '$lib/server/services/recommendations';
import {
  resolveActiveGroups,
  exercisesForGroups,
  exercisesInAnyGroup,
  listGroups,
  getWeeklySchedule,
  getAllMemberships,
  getExerciseGroupIds
} from '$lib/server/services/routines';
import {
  exerciseHistory,
  lastPerformedByExercise,
  lastSummaryForExercises
} from '$lib/server/services/history';
import { listExercises } from '$lib/server/services/exercises';
import { listWorkouts, getWorkoutDetail } from '$lib/server/services/workouts';
import { getActiveGoal } from '$lib/server/services/goals';
import { commentsForWorkout, listComments } from '$lib/server/services/comments';
import { detectStall } from '$lib/server/engine/stall';
import { targetLabel, todayStr } from '$lib/format';
import type { TodayCard, TargetRow } from '$lib/types';

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
export async function todayView(user: SessionUser) {
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

  // Exercises with a baseline (a target to hit) first, then ones still needing
  // a baseline; alphabetical within each.
  cards.sort(
    (a, b) =>
      Number(b.rawTarget != null) - Number(a.rawTarget != null) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

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
}

export async function exercisesView(user: SessionUser) {
  return { exercises: await listExercises(user.id) };
}

export async function exerciseDetailView(user: SessionUser, id: string) {
  const [exercise] = await db.select().from(exercises).where(eq(exercises.id, id));
  if (!exercise) throw error(404, 'Exercise not found');

  const [points, goal, groups, memberOf, comments] = await Promise.all([
    exerciseHistory(user.id, id, 30),
    getActiveGoal(user.id, id),
    listGroups(user.id),
    getExerciseGroupIds(user.id, id),
    listComments(user.id, { targetType: 'exercise', targetId: id, limit: 50 })
  ]);

  const series = [...points]
    .reverse()
    .map((p) => p.estimated1RM)
    .filter((n): n is number => n != null);

  return {
    exercise: {
      id: exercise.id,
      name: exercise.name,
      unit: exercise.unit,
      modality: exercise.modality,
      tracksSpeedZones: exercise.tracksSpeedZones
    },
    goal: goal?.goal ?? exercise.defaultGoal ?? 'strength',
    points,
    stall: detectStall(series),
    groups: groups.map((g) => ({ id: g.id, name: g.name, color: g.color })),
    memberOf,
    comments
  };
}

export async function historyView(user: SessionUser) {
  return { workouts: await listWorkouts(user.id, 60) };
}

export async function routinesView(user: SessionUser) {
  const [groups, exList, schedule, memberships] = await Promise.all([
    listGroups(user.id),
    listExercises(user.id),
    getWeeklySchedule(user.id),
    getAllMemberships(user.id)
  ]);

  // groupId -> exerciseId[] for the membership checklists.
  const members: Record<string, string[]> = {};
  for (const g of groups) members[g.id] = [];
  for (const m of memberships) (members[m.groupId] ??= []).push(m.exerciseId);

  return {
    groups,
    schedule,
    members,
    exercises: exList.map((e) => ({
      id: e.id,
      name: e.name,
      modality: e.modality,
      defaultGoal: e.defaultGoal
    }))
  };
}

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
export async function targetsView(user: SessionUser) {
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
}

function durationMin(w: { startedAt: Date | string | null; endedAt: Date | string | null }) {
  return w.endedAt && w.startedAt
    ? Math.round((new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime()) / 60000)
    : null;
}

export async function workoutView(user: SessionUser, id: string) {
  const workout = await getWorkoutDetail(user.id, id);
  if (!workout) throw error(404, 'Workout not found');

  const totalSets = workout.entries.reduce(
    (n, e) => n + e.sets.filter((s) => !s.isWarmup).length,
    0
  );

  const comments = await commentsForWorkout(user.id, id);
  return { workout, durationMin: durationMin(workout), totalSets, comments };
}

export async function workoutSummaryView(user: SessionUser, id: string) {
  const workout = await getWorkoutDetail(user.id, id);
  if (!workout) throw error(404, 'Workout not found');

  const exerciseIds = new Set(workout.entries.map((e) => e.exerciseId));
  const allRecs = await getPendingRecommendations(user.id);
  const recommendations = allRecs.filter((r) => exerciseIds.has(r.exerciseId));

  // Zone breakdown of any speed-zoned run(s) in this session.
  const runs = workout.entries
    .filter((e) => e.kind === 'cardio' && e.cardio?.zones)
    .map((e) => ({ name: e.name, zones: e.cardio!.zones! }));

  return {
    title: workout.title,
    exerciseCount: workout.entries.length,
    durationMin: durationMin(workout),
    recommendations,
    runs
  };
}
