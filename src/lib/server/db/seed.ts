import { db } from './index';
import { exercises, exerciseGroups, exerciseGroupMembers, users } from './schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';

type SeedExercise = {
  name: string;
  modality: 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cardio';
  kind: 'resistance' | 'cardio' | 'mobility';
  muscleGroups: string[];
  unit: 'lb' | 'kg' | 'km' | 'mi' | 'min';
  loadIncrement: string | null;
  defaultGoal: 'strength' | 'endurance' | 'stamina' | null;
  tracksSpeedZones?: boolean;
};

// Routines (migration 0005): groups are per-user, so they can't be built-ins
// (owner_id = null) like exercises. Instead each user is given a starter set of
// groups populated from the built-in library — see ensureDefaultGroupsForUser
// below. A weekly schedule is NOT seeded (we don't guess training days); until
// the user sets one, Today shows the pending-target backlog. See
// src/routes/(app)/+page.server.ts.

/** Built-in library (owner_id = null) so logging works on day one. */
export const BUILT_IN: SeedExercise[] = [
  // Barbell
  { name: 'Barbell Back Squat', modality: 'barbell', kind: 'resistance', muscleGroups: ['quads', 'glutes'], unit: 'lb', loadIncrement: '10', defaultGoal: 'strength' },
  { name: 'Barbell Bench Press', modality: 'barbell', kind: 'resistance', muscleGroups: ['chest', 'triceps'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  { name: 'Barbell Deadlift', modality: 'barbell', kind: 'resistance', muscleGroups: ['hamstrings', 'back', 'glutes'], unit: 'lb', loadIncrement: '10', defaultGoal: 'strength' },
  { name: 'Overhead Press', modality: 'barbell', kind: 'resistance', muscleGroups: ['shoulders', 'triceps'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  { name: 'Barbell Row', modality: 'barbell', kind: 'resistance', muscleGroups: ['back', 'biceps'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  { name: 'Front Squat', modality: 'barbell', kind: 'resistance', muscleGroups: ['quads', 'core'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  { name: 'Romanian Deadlift', modality: 'barbell', kind: 'resistance', muscleGroups: ['hamstrings', 'glutes'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  // Dumbbell
  { name: 'Dumbbell Bench Press', modality: 'dumbbell', kind: 'resistance', muscleGroups: ['chest', 'triceps'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  { name: 'Dumbbell Shoulder Press', modality: 'dumbbell', kind: 'resistance', muscleGroups: ['shoulders'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  { name: 'Dumbbell Curl', modality: 'dumbbell', kind: 'resistance', muscleGroups: ['biceps'], unit: 'lb', loadIncrement: '2.5', defaultGoal: 'endurance' },
  { name: 'Dumbbell Row', modality: 'dumbbell', kind: 'resistance', muscleGroups: ['back', 'biceps'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  { name: 'Lateral Raise', modality: 'dumbbell', kind: 'resistance', muscleGroups: ['shoulders'], unit: 'lb', loadIncrement: '2.5', defaultGoal: 'endurance' },
  { name: 'Bulgarian Split Squat', modality: 'dumbbell', kind: 'resistance', muscleGroups: ['quads', 'glutes'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  // Machine / cable
  { name: 'Lat Pulldown', modality: 'machine', kind: 'resistance', muscleGroups: ['back', 'biceps'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  { name: 'Leg Press', modality: 'machine', kind: 'resistance', muscleGroups: ['quads', 'glutes'], unit: 'lb', loadIncrement: '10', defaultGoal: 'strength' },
  { name: 'Seated Cable Row', modality: 'machine', kind: 'resistance', muscleGroups: ['back'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  { name: 'Leg Curl', modality: 'machine', kind: 'resistance', muscleGroups: ['hamstrings'], unit: 'lb', loadIncrement: '5', defaultGoal: 'endurance' },
  { name: 'Leg Extension', modality: 'machine', kind: 'resistance', muscleGroups: ['quads'], unit: 'lb', loadIncrement: '5', defaultGoal: 'endurance' },
  { name: 'Cable Triceps Pushdown', modality: 'machine', kind: 'resistance', muscleGroups: ['triceps'], unit: 'lb', loadIncrement: '5', defaultGoal: 'endurance' },
  { name: 'Face Pull', modality: 'machine', kind: 'resistance', muscleGroups: ['rear-delts', 'upper-back'], unit: 'lb', loadIncrement: '5', defaultGoal: 'endurance' },
  // Bodyweight
  { name: 'Pull-up', modality: 'bodyweight', kind: 'resistance', muscleGroups: ['back', 'biceps'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  { name: 'Chin-up', modality: 'bodyweight', kind: 'resistance', muscleGroups: ['back', 'biceps'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  { name: 'Dip', modality: 'bodyweight', kind: 'resistance', muscleGroups: ['chest', 'triceps'], unit: 'lb', loadIncrement: '5', defaultGoal: 'strength' },
  { name: 'Push-up', modality: 'bodyweight', kind: 'resistance', muscleGroups: ['chest', 'triceps'], unit: 'lb', loadIncrement: null, defaultGoal: 'endurance' },
  { name: 'Plank', modality: 'bodyweight', kind: 'resistance', muscleGroups: ['core'], unit: 'min', loadIncrement: null, defaultGoal: 'stamina' },
  { name: 'Hanging Leg Raise', modality: 'bodyweight', kind: 'resistance', muscleGroups: ['core'], unit: 'lb', loadIncrement: null, defaultGoal: 'endurance' },
  // Cardio
  { name: 'Running', modality: 'cardio', kind: 'cardio', muscleGroups: ['full-body'], unit: 'mi', loadIncrement: null, defaultGoal: 'stamina', tracksSpeedZones: true },
  { name: 'Cycling', modality: 'cardio', kind: 'cardio', muscleGroups: ['legs'], unit: 'mi', loadIncrement: null, defaultGoal: 'stamina', tracksSpeedZones: true },
  { name: 'Rowing', modality: 'cardio', kind: 'cardio', muscleGroups: ['full-body'], unit: 'km', loadIncrement: null, defaultGoal: 'stamina', tracksSpeedZones: true },
  { name: 'Incline Treadmill Walk', modality: 'cardio', kind: 'cardio', muscleGroups: ['legs'], unit: 'min', loadIncrement: null, defaultGoal: 'stamina' },
  { name: 'Jump Rope', modality: 'cardio', kind: 'cardio', muscleGroups: ['calves', 'full-body'], unit: 'min', loadIncrement: null, defaultGoal: 'stamina' }
];

/** Insert built-ins that are not already present (idempotent by name). */
export async function seedBuiltInExercises() {
  const existing = await db
    .select({ name: exercises.name })
    .from(exercises)
    .where(isNull(exercises.ownerId));
  const have = new Set(existing.map((e) => e.name));

  const toInsert = BUILT_IN.filter((ex) => !have.has(ex.name)).map((ex) => ({
    ownerId: null,
    name: ex.name,
    modality: ex.modality,
    kind: ex.kind,
    muscleGroups: ex.muscleGroups,
    unit: ex.unit,
    loadIncrement: ex.loadIncrement,
    defaultGoal: ex.defaultGoal,
    tracksSpeedZones: ex.tracksSpeedZones ?? false
  }));

  if (toInsert.length) {
    await db.insert(exercises).values(toInsert).onConflictDoNothing();
  }
  console.log(`[seed] built-in exercises: ${have.size + toInsert.length} (${toInsert.length} new)`);
}

// ---------------------------------------------------------------------------
// Default routine groups (per-user)
// ---------------------------------------------------------------------------

type ExerciseLite = {
  id: string;
  muscleGroups: string[];
  kind: 'resistance' | 'cardio' | 'mobility';
  modality: string;
};

const hasAny = (groups: string[], wanted: string[]) =>
  groups.some((g) => wanted.includes(g));

/**
 * A starter set of groups so routines work out of the box. Membership is derived
 * from each exercise's muscle groups, so one exercise lands in several groups
 * (Bench ∈ Push ∪ Upper Body) — exactly what the many-to-many model is for.
 * `color` is a GROUP_COLORS key (see src/lib/format.ts). Users can rename,
 * recolor, delete, or re-populate any of these from the Routines screen.
 */
const DEFAULT_GROUPS: Array<{
  name: string;
  color: string;
  match: (ex: ExerciseLite) => boolean;
}> = [
  {
    name: 'Push',
    color: 'danger',
    match: (ex) =>
      ex.kind === 'resistance' && hasAny(ex.muscleGroups, ['chest', 'shoulders', 'triceps'])
  },
  {
    name: 'Pull',
    color: 'strength',
    match: (ex) =>
      ex.kind === 'resistance' &&
      hasAny(ex.muscleGroups, ['back', 'biceps', 'rear-delts', 'upper-back', 'lats'])
  },
  {
    name: 'Legs',
    color: 'stamina',
    match: (ex) =>
      ex.kind === 'resistance' &&
      hasAny(ex.muscleGroups, ['quads', 'hamstrings', 'glutes', 'calves', 'legs'])
  },
  {
    name: 'Core',
    color: 'warning',
    match: (ex) => hasAny(ex.muscleGroups, ['core'])
  },
  {
    name: 'Upper Body',
    color: 'endurance',
    match: (ex) =>
      ex.kind === 'resistance' &&
      hasAny(ex.muscleGroups, [
        'chest',
        'back',
        'shoulders',
        'triceps',
        'biceps',
        'rear-delts',
        'upper-back'
      ])
  },
  {
    name: 'Chest',
    color: 'danger',
    match: (ex) => ex.kind === 'resistance' && hasAny(ex.muscleGroups, ['chest'])
  },
  {
    name: 'Back',
    color: 'strength',
    match: (ex) =>
      ex.kind === 'resistance' && hasAny(ex.muscleGroups, ['back', 'upper-back', 'lats'])
  },
  {
    name: 'Shoulders',
    color: 'endurance',
    match: (ex) =>
      ex.kind === 'resistance' && hasAny(ex.muscleGroups, ['shoulders', 'rear-delts'])
  },
  {
    name: 'Arms',
    color: 'accent',
    match: (ex) =>
      ex.kind === 'resistance' && hasAny(ex.muscleGroups, ['biceps', 'triceps', 'forearms'])
  },
  {
    name: 'Cardio',
    color: 'stamina',
    match: (ex) => ex.kind === 'cardio' || ex.modality === 'cardio'
  }
];

// The original starter set, before the per-muscle groups were added. Used to
// treat legacy users (flagged with the old all-or-nothing `routinesSeeded`) as
// already having these, so only the newly-introduced groups get back-filled.
const LEGACY_SEEDED_NAMES = ['Push', 'Pull', 'Legs', 'Core', 'Upper Body', 'Cardio'];

/**
 * Create any not-yet-seeded default groups for one user, populated from the
 * exercises visible to them (built-ins + their own). Idempotent PER GROUP: it
 * tracks the default-group names already handled in `prefs.seededGroups`, so
 * newly-introduced defaults get back-filled onto existing accounts, while a
 * group the user deleted is never resurrected. Legacy accounts carrying the old
 * all-or-nothing `routinesSeeded` flag are treated as already having the
 * original starter set, so only the new groups are added.
 */
export async function ensureDefaultGroupsForUser(userId: string) {
  const [u] = await db.select({ prefs: users.prefs }).from(users).where(eq(users.id, userId));
  if (!u) return;
  const prefs = (u.prefs as Record<string, unknown>) ?? {};

  const seeded = new Set<string>(
    Array.isArray(prefs.seededGroups)
      ? (prefs.seededGroups as string[])
      : prefs.routinesSeeded
        ? LEGACY_SEEDED_NAMES
        : []
  );

  const todo = DEFAULT_GROUPS.filter((dg) => !seeded.has(dg.name));
  if (!todo.length) return; // nothing new to add for this user

  // Never duplicate a group the user already has by that name (e.g. one they
  // made themselves, or a legacy default we're about to mark seeded).
  const existing = await db
    .select({ name: exerciseGroups.name })
    .from(exerciseGroups)
    .where(eq(exerciseGroups.userId, userId));
  const existingNames = new Set(existing.map((g) => g.name));

  const available = (await db
    .select({
      id: exercises.id,
      muscleGroups: exercises.muscleGroups,
      kind: exercises.kind,
      modality: exercises.modality
    })
    .from(exercises)
    .where(
      and(
        or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)),
        eq(exercises.isArchived, false)
      )
    )) as ExerciseLite[];

  const [agg] = await db
    .select({ max: sql<number>`coalesce(max(${exerciseGroups.orderIndex}), -1)` })
    .from(exerciseGroups)
    .where(eq(exerciseGroups.userId, userId));
  let order = (agg?.max ?? -1) + 1;

  let created = 0;
  for (const dg of todo) {
    seeded.add(dg.name); // mark handled regardless, so we don't retry endlessly
    if (existingNames.has(dg.name)) continue;
    const memberIds = available.filter(dg.match).map((e) => e.id);
    if (!memberIds.length) continue; // don't create an empty group
    const [group] = await db
      .insert(exerciseGroups)
      .values({ userId, name: dg.name, color: dg.color, orderIndex: order++ })
      .returning({ id: exerciseGroups.id });
    await db
      .insert(exerciseGroupMembers)
      .values(memberIds.map((exerciseId) => ({ groupId: group.id, exerciseId })))
      .onConflictDoNothing();
    created++;
  }

  await db
    .update(users)
    .set({ prefs: { ...prefs, routinesSeeded: true, seededGroups: [...seeded] } })
    .where(eq(users.id, userId));
  if (created) console.log(`[seed] default groups for user ${userId}: +${created}`);
}

/** Back-fill default groups for every existing user that hasn't been seeded. */
export async function seedDefaultGroupsForUsers() {
  const all = await db.select({ id: users.id }).from(users);
  for (const u of all) await ensureDefaultGroupsForUser(u.id);
}
