import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  primaryKey,
  unique
} from 'drizzle-orm/pg-core';

/** Goal taxonomy that drives the progression engine. */
export type Goal = 'strength' | 'endurance' | 'stamina';
/** Stamina splits into two progression flavors (see engine). */
export type StaminaMode = 'cardio' | 'work_capacity';
export type UserRole = 'admin' | 'member';
export type Unit = 'lb' | 'kg' | 'km' | 'mi' | 'min';
/** Speed zones a run is broken into. Walk is recovery; jog and sprint progress. */
export type SpeedZone = 'walk' | 'jog' | 'sprint';
/** One labelled stretch of a run at a single effort/speed. */
export type RunSegment = {
  zone: SpeedZone;
  durationSec: number;
  distance?: number;
  paceSec?: number;
};

// ---------------------------------------------------------------------------
// Accounts & auth
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email'),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<UserRole>().notNull().default('member'),
  defaultUnit: text('default_unit').$type<'lb' | 'kg'>().notNull().default('lb'),
  prefs: jsonb('prefs').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const invites = pgTable('invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  codeHash: text('code_hash').notNull().unique(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  note: text('note'),
  maxUses: integer('max_uses').notNull().default(1),
  uses: integer('uses').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const authSessions = pgTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

export const exercises = pgTable(
  'exercises',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    modality: text('modality')
      .$type<'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cardio'>()
      .notNull(),
    kind: text('kind').$type<'resistance' | 'cardio' | 'mobility'>().notNull(),
    muscleGroups: text('muscle_groups').array().notNull().default([]),
    unit: text('unit').$type<Unit>().notNull().default('lb'),
    loadIncrement: numeric('load_increment'),
    defaultGoal: text('default_goal').$type<Goal>(),
    tracksSpeedZones: boolean('tracks_speed_zones').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false)
  },
  (t) => ({
    ownerIdx: index('exercises_owner_idx').on(t.ownerId)
  })
);

export const exerciseGoals = pgTable(
  'exercise_goals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    goal: text('goal').$type<Goal>().notNull(),
    staminaMode: text('stamina_mode').$type<StaminaMode>(),
    repLow: integer('rep_low'),
    repHigh: integer('rep_high'),
    targetSets: integer('target_sets').notNull().default(3),
    targetRir: integer('target_rir').notNull().default(2),
    cardioMetric: text('cardio_metric').$type<'duration' | 'distance' | 'pace'>(),
    active: boolean('active').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    userExerciseIdx: index('exercise_goals_user_exercise_idx').on(t.userId, t.exerciseId)
  })
);

// ---------------------------------------------------------------------------
// Training log
// ---------------------------------------------------------------------------

export const workouts = pgTable(
  'workouts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title'),
    notes: text('notes'),
    readiness: jsonb('readiness').$type<{
      sleep?: number;
      soreness?: number;
      stress?: number;
      energy?: number;
    } | null>(),
    sessionRpe: integer('session_rpe'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true })
  },
  (t) => ({
    userStartedIdx: index('workouts_user_started_idx').on(t.userId, t.startedAt)
  })
);

export const workoutExercises = pgTable('workout_exercises', {
  id: uuid('id').defaultRandom().primaryKey(),
  workoutId: uuid('workout_id')
    .notNull()
    .references(() => workouts.id, { onDelete: 'cascade' }),
  exerciseId: uuid('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'restrict' }),
  orderIndex: integer('order_index').notNull().default(0),
  goalSnapshot: text('goal_snapshot').$type<Goal>().notNull(),
  notes: text('notes')
});

export const sets = pgTable(
  'sets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workoutExerciseId: uuid('workout_exercise_id')
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    setIndex: integer('set_index').notNull(),
    isWarmup: boolean('is_warmup').notNull().default(false),
    weight: numeric('weight'),
    reps: integer('reps').notNull(),
    rir: integer('rir'),
    rpe: numeric('rpe'),
    tempo: text('tempo'),
    restSec: integer('rest_sec'),
    isPr: boolean('is_pr').notNull().default(false)
  },
  (t) => ({
    weIdx: index('sets_workout_exercise_idx').on(t.workoutExerciseId)
  })
);

export const cardioBouts = pgTable('cardio_bouts', {
  id: uuid('id').defaultRandom().primaryKey(),
  workoutExerciseId: uuid('workout_exercise_id')
    .notNull()
    .references(() => workoutExercises.id, { onDelete: 'cascade' }),
  durationSec: integer('duration_sec').notNull(),
  distance: numeric('distance'),
  avgPaceSec: integer('avg_pace_sec'),
  avgHr: integer('avg_hr'),
  maxHr: integer('max_hr'),
  intervals: jsonb('intervals').$type<
    Array<{ workSec: number; restSec: number; pace?: number; hr?: number }>
  >(),
  /** Walk/Jog/Sprint breakdown of the run, in the order performed. */
  segments: jsonb('segments').$type<RunSegment[]>(),
  perceived: integer('perceived')
});

// ---------------------------------------------------------------------------
// Engine outputs
// ---------------------------------------------------------------------------

export const recommendations = pgTable(
  'recommendations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    goal: text('goal').$type<Goal>().notNull(),
    target: jsonb('target').$type<Record<string, unknown>>().notNull(),
    rationale: text('rationale').notNull(),
    basis: jsonb('basis').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status')
      .$type<'pending' | 'accepted' | 'modified' | 'skipped'>()
      .notNull()
      .default('pending'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    userExerciseIdx: index('recommendations_user_exercise_idx').on(t.userId, t.exerciseId)
  })
);

// ---------------------------------------------------------------------------
// Routines: exercise groups, weekly schedule, same-day plan override
// ---------------------------------------------------------------------------

/** A user's named exercise group (e.g. "Push", "Arms", "Upper Body"). */
export const exerciseGroups = pgTable(
  'exercise_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Design-token key (see routines palette), not a raw hex. */
    color: text('color'),
    icon: text('icon'),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    userIdx: index('exercise_groups_user_idx').on(t.userId)
  })
);

/** Many-to-many: one exercise can belong to many groups. */
export const exerciseGroupMembers = pgTable(
  'exercise_group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => exerciseGroups.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' })
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.exerciseId] }),
    exIdx: index('exercise_group_members_ex_idx').on(t.exerciseId)
  })
);

/** Recurring weekly default: a weekday (0–6, Sun=0) maps to many groups. */
export const routineSchedule = pgTable(
  'routine_schedule',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => exerciseGroups.id, { onDelete: 'cascade' })
  },
  (t) => ({
    uniq: unique('routine_schedule_uniq').on(t.userId, t.dayOfWeek, t.groupId),
    userDayIdx: index('routine_schedule_user_day_idx').on(t.userId, t.dayOfWeek)
  })
);

/**
 * Same-day override. When any row exists for (user, date) it REPLACES the
 * weekday's scheduled groups for that date only; absence falls back to
 * routine_schedule. This is how a one-off swap works without mutating the
 * recurring weekly schedule.
 */
export const dayPlan = pgTable(
  'day_plan',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => exerciseGroups.id, { onDelete: 'cascade' })
  },
  (t) => ({
    uniq: unique('day_plan_uniq').on(t.userId, t.date, t.groupId),
    userDateIdx: index('day_plan_user_date_idx').on(t.userId, t.date)
  })
);

export const personalRecords = pgTable('personal_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  exerciseId: uuid('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'cascade' }),
  kind: text('kind')
    .$type<'est_1rm' | 'max_weight' | 'rep_max' | 'max_reps' | 'distance' | 'best_pace'>()
    .notNull(),
  value: numeric('value').notNull(),
  sourceSetId: uuid('source_set_id'),
  achievedAt: timestamp('achieved_at', { withTimezone: true }).notNull().defaultNow()
});
