import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  exerciseGroups,
  exerciseGroupMembers,
  routineSchedule,
  dayPlan,
  exercises
} from '$lib/server/db/schema';

/**
 * Routines: named exercise groups, the recurring weekly schedule, and same-day
 * plan overrides. Everything here is owner-scoped — callers pass the session
 * userId and we never trust a client-supplied one. Group ids coming from the
 * client are always re-checked for ownership before any membership/schedule/
 * plan write (see ownedGroupIds / ownsGroup).
 */

export type GroupRow = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  orderIndex: number;
  memberCount: number;
};

export async function listGroups(userId: string): Promise<GroupRow[]> {
  return db
    .select({
      id: exerciseGroups.id,
      name: exerciseGroups.name,
      color: exerciseGroups.color,
      icon: exerciseGroups.icon,
      orderIndex: exerciseGroups.orderIndex,
      memberCount: sql<number>`count(${exerciseGroupMembers.exerciseId})`.mapWith(Number)
    })
    .from(exerciseGroups)
    .leftJoin(exerciseGroupMembers, eq(exerciseGroupMembers.groupId, exerciseGroups.id))
    .where(eq(exerciseGroups.userId, userId))
    .groupBy(exerciseGroups.id)
    .orderBy(exerciseGroups.orderIndex, exerciseGroups.name);
}

export async function createGroup(
  userId: string,
  data: { name: string; color?: string | null; icon?: string | null }
) {
  const [agg] = await db
    .select({ max: sql<number>`coalesce(max(${exerciseGroups.orderIndex}), -1)` })
    .from(exerciseGroups)
    .where(eq(exerciseGroups.userId, userId));
  const [row] = await db
    .insert(exerciseGroups)
    .values({
      userId,
      name: data.name.trim() || 'New group',
      color: data.color ?? null,
      icon: data.icon ?? null,
      orderIndex: (agg?.max ?? -1) + 1
    })
    .returning();
  return row;
}

export async function updateGroup(
  userId: string,
  id: string,
  patch: { name?: string; color?: string | null; icon?: string | null }
) {
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.color !== undefined) set.color = patch.color;
  if (patch.icon !== undefined) set.icon = patch.icon;
  if (!Object.keys(set).length) return;
  await db
    .update(exerciseGroups)
    .set(set)
    .where(and(eq(exerciseGroups.id, id), eq(exerciseGroups.userId, userId)));
}

export async function deleteGroup(userId: string, id: string) {
  await db
    .delete(exerciseGroups)
    .where(and(eq(exerciseGroups.id, id), eq(exerciseGroups.userId, userId)));
}

async function ownsGroup(userId: string, groupId: string): Promise<boolean> {
  const [g] = await db
    .select({ id: exerciseGroups.id })
    .from(exerciseGroups)
    .where(and(eq(exerciseGroups.id, groupId), eq(exerciseGroups.userId, userId)));
  return !!g;
}

/** Filter a list of group ids down to the ones this user actually owns. */
async function ownedGroupIds(userId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: exerciseGroups.id })
    .from(exerciseGroups)
    .where(and(eq(exerciseGroups.userId, userId), inArray(exerciseGroups.id, ids)));
  return rows.map((r) => r.id);
}

// --- Membership -----------------------------------------------------------

/** Toggle one exercise's membership in a group (owner-checked). */
export async function setMembership(
  userId: string,
  groupId: string,
  exerciseId: string,
  member: boolean
) {
  if (!(await ownsGroup(userId, groupId))) return;
  if (member) {
    await db
      .insert(exerciseGroupMembers)
      .values({ groupId, exerciseId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(exerciseGroupMembers)
      .where(
        and(
          eq(exerciseGroupMembers.groupId, groupId),
          eq(exerciseGroupMembers.exerciseId, exerciseId)
        )
      );
  }
}

/** Replace a group's full membership set in one shot (owner-checked). */
export async function setGroupMembers(userId: string, groupId: string, exerciseIds: string[]) {
  if (!(await ownsGroup(userId, groupId))) return;
  await db.delete(exerciseGroupMembers).where(eq(exerciseGroupMembers.groupId, groupId));
  if (exerciseIds.length) {
    await db
      .insert(exerciseGroupMembers)
      .values(exerciseIds.map((exerciseId) => ({ groupId, exerciseId })))
      .onConflictDoNothing();
  }
}

/** Exercise ids in a group (owner-checked). */
export async function getGroupMemberIds(userId: string, groupId: string): Promise<string[]> {
  const rows = await db
    .select({ exerciseId: exerciseGroupMembers.exerciseId })
    .from(exerciseGroupMembers)
    .innerJoin(exerciseGroups, eq(exerciseGroups.id, exerciseGroupMembers.groupId))
    .where(and(eq(exerciseGroupMembers.groupId, groupId), eq(exerciseGroups.userId, userId)));
  return rows.map((r) => r.exerciseId);
}

/** All (groupId, exerciseId) memberships for the user — powers the Routines
 *  management screen in one query. */
export async function getAllMemberships(
  userId: string
): Promise<Array<{ groupId: string; exerciseId: string }>> {
  return db
    .select({
      groupId: exerciseGroupMembers.groupId,
      exerciseId: exerciseGroupMembers.exerciseId
    })
    .from(exerciseGroupMembers)
    .innerJoin(exerciseGroups, eq(exerciseGroups.id, exerciseGroupMembers.groupId))
    .where(eq(exerciseGroups.userId, userId));
}

/** Which of this user's groups a given exercise belongs to (for the toggles on
 *  the exercise detail page). */
export async function getExerciseGroupIds(userId: string, exerciseId: string): Promise<string[]> {
  const rows = await db
    .select({ groupId: exerciseGroupMembers.groupId })
    .from(exerciseGroupMembers)
    .innerJoin(exerciseGroups, eq(exerciseGroups.id, exerciseGroupMembers.groupId))
    .where(
      and(eq(exerciseGroupMembers.exerciseId, exerciseId), eq(exerciseGroups.userId, userId))
    );
  return rows.map((r) => r.groupId);
}

// --- Weekly schedule ------------------------------------------------------

/** day_of_week (0–6) -> group ids. Every weekday key is present. */
export async function getWeeklySchedule(userId: string): Promise<Record<number, string[]>> {
  const rows = await db
    .select({ dayOfWeek: routineSchedule.dayOfWeek, groupId: routineSchedule.groupId })
    .from(routineSchedule)
    .where(eq(routineSchedule.userId, userId));
  const out: Record<number, string[]> = {};
  for (let d = 0; d < 7; d++) out[d] = [];
  for (const r of rows) out[r.dayOfWeek].push(r.groupId);
  return out;
}

/** Replace the groups assigned to one weekday (owner-checked group ids). */
export async function setDaySchedule(userId: string, dayOfWeek: number, groupIds: string[]) {
  const valid = await ownedGroupIds(userId, groupIds);
  await db
    .delete(routineSchedule)
    .where(and(eq(routineSchedule.userId, userId), eq(routineSchedule.dayOfWeek, dayOfWeek)));
  if (valid.length) {
    await db
      .insert(routineSchedule)
      .values(valid.map((groupId) => ({ userId, dayOfWeek, groupId })))
      .onConflictDoNothing();
  }
}

// --- Same-day plan (swap) -------------------------------------------------

export async function getDayPlan(userId: string, date: string): Promise<string[]> {
  const rows = await db
    .select({ groupId: dayPlan.groupId })
    .from(dayPlan)
    .where(and(eq(dayPlan.userId, userId), eq(dayPlan.date, date)));
  return rows.map((r) => r.groupId);
}

/**
 * Set today's (or any date's) active groups, overriding the weekly schedule for
 * that date only. Passing an empty list clears the override, reverting the date
 * back to the weekly default. Never touches routine_schedule.
 */
export async function setDayPlan(userId: string, date: string, groupIds: string[]) {
  const valid = await ownedGroupIds(userId, groupIds);
  await db.delete(dayPlan).where(and(eq(dayPlan.userId, userId), eq(dayPlan.date, date)));
  if (valid.length) {
    await db
      .insert(dayPlan)
      .values(valid.map((groupId) => ({ userId, date, groupId })))
      .onConflictDoNothing();
  }
}

export async function clearDayPlan(userId: string, date: string) {
  await db.delete(dayPlan).where(and(eq(dayPlan.userId, userId), eq(dayPlan.date, date)));
}

// --- Resolution for Today -------------------------------------------------

export type ActiveGroup = { id: string; name: string; color: string | null };

/**
 * The groups active for a date: the day_plan override if any row exists for
 * that date, otherwise the weekday's recurring schedule. `source` says which,
 * so the UI can show a "today only" hint when a swap is in effect.
 */
export async function resolveActiveGroups(
  userId: string,
  date: string,
  dayOfWeek: number
): Promise<{ groups: ActiveGroup[]; source: 'day_plan' | 'schedule' }> {
  const override = await getDayPlan(userId, date);
  let ids: string[];
  let source: 'day_plan' | 'schedule';
  if (override.length) {
    ids = override;
    source = 'day_plan';
  } else {
    const rows = await db
      .select({ groupId: routineSchedule.groupId })
      .from(routineSchedule)
      .where(and(eq(routineSchedule.userId, userId), eq(routineSchedule.dayOfWeek, dayOfWeek)));
    ids = rows.map((r) => r.groupId);
    source = 'schedule';
  }
  if (!ids.length) return { groups: [], source };
  const groups = await db
    .select({ id: exerciseGroups.id, name: exerciseGroups.name, color: exerciseGroups.color })
    .from(exerciseGroups)
    .where(and(eq(exerciseGroups.userId, userId), inArray(exerciseGroups.id, ids)))
    .orderBy(exerciseGroups.orderIndex, exerciseGroups.name);
  return { groups, source };
}

export type GroupExercise = {
  id: string;
  name: string;
  unit: string;
  kind: 'resistance' | 'cardio' | 'mobility';
  modality: string;
  defaultGoal: 'strength' | 'endurance' | 'stamina' | null;
  loadIncrement: string | null;
  tracksSpeedZones: boolean;
};

/** Deduped union of the exercises across a set of (already owner-scoped) groups. */
export async function exercisesForGroups(groupIds: string[]): Promise<GroupExercise[]> {
  if (!groupIds.length) return [];
  return db
    .selectDistinct({
      id: exercises.id,
      name: exercises.name,
      unit: exercises.unit,
      kind: exercises.kind,
      modality: exercises.modality,
      defaultGoal: exercises.defaultGoal,
      loadIncrement: exercises.loadIncrement,
      tracksSpeedZones: exercises.tracksSpeedZones
    })
    .from(exerciseGroupMembers)
    .innerJoin(exercises, eq(exercises.id, exerciseGroupMembers.exerciseId))
    .where(inArray(exerciseGroupMembers.groupId, groupIds))
    .orderBy(exercises.name);
}

/** Distinct exercises that are a member of at least one of the user's groups
 *  (powers the Targets "Due" view, which ignores random one-offs). */
export async function exercisesInAnyGroup(userId: string): Promise<GroupExercise[]> {
  return db
    .selectDistinct({
      id: exercises.id,
      name: exercises.name,
      unit: exercises.unit,
      kind: exercises.kind,
      modality: exercises.modality,
      defaultGoal: exercises.defaultGoal,
      loadIncrement: exercises.loadIncrement,
      tracksSpeedZones: exercises.tracksSpeedZones
    })
    .from(exerciseGroupMembers)
    .innerJoin(exerciseGroups, eq(exerciseGroups.id, exerciseGroupMembers.groupId))
    .innerJoin(exercises, eq(exercises.id, exerciseGroupMembers.exerciseId))
    .where(eq(exerciseGroups.userId, userId))
    .orderBy(exercises.name);
}
