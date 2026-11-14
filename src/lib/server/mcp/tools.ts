/**
 * MCP tools: read-only views over the user's data, plus comments. Every tool
 * is scoped to the token's user; nothing here can modify training data.
 */
import { and, desc, eq, gte, inArray, lte, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  users,
  workouts,
  workoutExercises,
  exercises,
  personalRecords,
  exerciseGoals,
  type CommentTarget
} from '$lib/server/db/schema';
import type { McpAuth, Scope } from '$lib/server/auth/oauth';
import { getWorkoutDetail } from '$lib/server/services/workouts';
import { exerciseHistory, lastPerformedByExercise } from '$lib/server/services/history';
import { getPendingRecommendations } from '$lib/server/services/recommendations';
import { listGroups, getWeeklySchedule, getAllMemberships } from '$lib/server/services/routines';
import { detectStall } from '$lib/server/engine/stall';
import { exportUserData } from '$lib/server/services/export';
import {
  COMMENT_TARGETS,
  addComment,
  commentsForWorkout,
  deleteComment,
  listComments,
  targetExists
} from '$lib/server/services/comments';

type Args = Record<string, unknown>;

export class ToolError extends Error {}

type Tool = {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  readOnly: boolean;
  inputSchema: Record<string, unknown>;
  run: (auth: McpAuth, args: Args) => Promise<unknown>;
};

const uuidProp = (description: string) => ({ type: 'string', format: 'uuid', description });
const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false
});

function str(args: Args, key: string, required = false): string | null {
  const v = args[key];
  if (v == null || v === '') {
    if (required) throw new ToolError(`"${key}" is required.`);
    return null;
  }
  if (typeof v !== 'string') throw new ToolError(`"${key}" must be a string.`);
  return v;
}

function int(args: Args, key: string, fallback: number, max: number): number {
  const v = args[key];
  if (v == null) return fallback;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 1) throw new ToolError(`"${key}" must be a positive number.`);
  return Math.min(Math.floor(n), max);
}

function date(args: Args, key: string): Date | null {
  const s = str(args, key);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new ToolError(`"${key}" must be an ISO date (e.g. 2026-01-31).`);
  return d;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(args: Args, key: string, required = true): string | null {
  const s = str(args, key, required);
  if (s && !UUID.test(s)) throw new ToolError(`"${key}" must be a UUID.`);
  return s;
}

const num = (v: string | null) => (v != null ? Number(v) : null);

export const TOOLS: Tool[] = [
  {
    name: 'get_profile',
    title: 'Get profile',
    description:
      "The user's account basics (username, preferred unit, member since) and a count of logged workouts. Start here.",
    scope: 'read',
    readOnly: true,
    inputSchema: obj(),
    async run(auth) {
      const [u] = await db
        .select({
          username: users.username,
          role: users.role,
          defaultUnit: users.defaultUnit,
          createdAt: users.createdAt
        })
        .from(users)
        .where(eq(users.id, auth.userId));
      const ws = await db
        .select({ startedAt: workouts.startedAt })
        .from(workouts)
        .where(eq(workouts.userId, auth.userId))
        .orderBy(desc(workouts.startedAt));
      return {
        ...u,
        workoutCount: ws.length,
        firstWorkout: ws.at(-1)?.startedAt ?? null,
        lastWorkout: ws[0]?.startedAt ?? null
      };
    }
  },
  {
    name: 'list_exercises',
    title: 'List exercises',
    description:
      'Exercises available to the user (built-in library + their custom ones), with their active training goal and when each was last performed. Use trainedOnly=true to see only exercises they have actually logged.',
    scope: 'read',
    readOnly: true,
    inputSchema: obj({
      trainedOnly: { type: 'boolean', description: 'Only exercises with at least one logged session. Default false.' }
    }),
    async run(auth, args) {
      const [all, goals, last] = await Promise.all([
        db
          .select()
          .from(exercises)
          .where(
            and(
              or(isNull(exercises.ownerId), eq(exercises.ownerId, auth.userId)),
              eq(exercises.isArchived, false)
            )
          )
          .orderBy(exercises.name),
        db
          .select()
          .from(exerciseGoals)
          .where(and(eq(exerciseGoals.userId, auth.userId), eq(exerciseGoals.active, true))),
        lastPerformedByExercise(auth.userId)
      ]);
      const goalBy = new Map(goals.map((g) => [g.exerciseId, g]));
      return all
        .filter((e) => !args.trainedOnly || last.has(e.id))
        .map((e) => {
          const g = goalBy.get(e.id);
          return {
            id: e.id,
            name: e.name,
            modality: e.modality,
            kind: e.kind,
            muscleGroups: e.muscleGroups,
            unit: e.unit,
            custom: e.ownerId != null,
            goal: g
              ? {
                  goal: g.goal,
                  staminaMode: g.staminaMode,
                  repRange: g.repLow != null ? [g.repLow, g.repHigh] : null,
                  targetSets: g.targetSets,
                  targetRir: g.targetRir
                }
              : e.defaultGoal
                ? { goal: e.defaultGoal, default: true }
                : null,
            lastPerformed: last.get(e.id) ?? null
          };
        });
    }
  },
  {
    name: 'list_workouts',
    title: 'List workouts',
    description:
      'Workout sessions, newest first, with the exercises in each. Filter by date range. Use get_workout for sets and details.',
    scope: 'read',
    readOnly: true,
    inputSchema: obj({
      after: { type: 'string', description: 'Only sessions started on/after this ISO date.' },
      before: { type: 'string', description: 'Only sessions started on/before this ISO date.' },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Default 30.' }
    }),
    async run(auth, args) {
      const conds = [eq(workouts.userId, auth.userId)];
      const after = date(args, 'after');
      const before = date(args, 'before');
      if (after) conds.push(gte(workouts.startedAt, after));
      if (before) conds.push(lte(workouts.startedAt, before));
      const rows = await db
        .select()
        .from(workouts)
        .where(and(...conds))
        .orderBy(desc(workouts.startedAt))
        .limit(int(args, 'limit', 30, 200));
      const ids = rows.map((w) => w.id);
      const entries = ids.length
        ? await db
            .select({ workoutId: workoutExercises.workoutId, name: exercises.name })
            .from(workoutExercises)
            .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
            .where(inArray(workoutExercises.workoutId, ids))
            .orderBy(workoutExercises.orderIndex)
        : [];
      return rows.map((w) => ({
        id: w.id,
        title: w.title,
        startedAt: w.startedAt,
        endedAt: w.endedAt,
        sessionRpe: w.sessionRpe,
        readiness: w.readiness,
        notes: w.notes,
        exercises: entries.filter((e) => e.workoutId === w.id).map((e) => e.name)
      }));
    }
  },
  {
    name: 'get_workout',
    title: 'Get workout',
    description:
      'One workout in full: every exercise with its sets (weight, reps, RIR, warmup, PR flags) or cardio bout, plus notes, readiness and any comments on it.',
    scope: 'read',
    readOnly: true,
    inputSchema: obj({ workoutId: uuidProp('Workout id from list_workouts.') }, ['workoutId']),
    async run(auth, args) {
      const id = uuid(args, 'workoutId')!;
      const w = await getWorkoutDetail(auth.userId, id);
      if (!w) throw new ToolError('Workout not found.');
      return { ...w, comments: await commentsForWorkout(auth.userId, id) };
    }
  },
  {
    name: 'get_exercise_history',
    title: 'Get exercise history',
    description:
      'Per-session history for one exercise, newest first: top set, estimated 1RM, volume, or distance/pace/HR/speed zones for cardio. Includes a stall check and comments on the exercise.',
    scope: 'read',
    readOnly: true,
    inputSchema: obj(
      {
        exerciseId: uuidProp('Exercise id from list_exercises.'),
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Sessions to return. Default 20.' }
      },
      ['exerciseId']
    ),
    async run(auth, args) {
      const id = uuid(args, 'exerciseId')!;
      if (!(await targetExists(auth.userId, 'exercise', id))) throw new ToolError('Exercise not found.');
      const [ex] = await db.select({ name: exercises.name, unit: exercises.unit }).from(exercises).where(eq(exercises.id, id));
      const points = await exerciseHistory(auth.userId, id, int(args, 'limit', 20, 100));
      const series = [...points]
        .reverse()
        .map((p) => p.estimated1RM)
        .filter((n): n is number => n != null);
      return {
        exercise: { id, ...ex },
        sessions: points,
        stall: detectStall(series),
        comments: await listComments(auth.userId, { targetType: 'exercise', targetId: id })
      };
    }
  },
  {
    name: 'get_personal_records',
    title: 'Get personal records',
    description: 'Personal records (est. 1RM, max weight, rep max, distance, best pace), optionally for one exercise.',
    scope: 'read',
    readOnly: true,
    inputSchema: obj({ exerciseId: uuidProp('Optional: limit to one exercise.') }),
    async run(auth, args) {
      const exId = uuid(args, 'exerciseId', false);
      const conds = [eq(personalRecords.userId, auth.userId)];
      if (exId) conds.push(eq(personalRecords.exerciseId, exId));
      const rows = await db
        .select({
          exerciseId: personalRecords.exerciseId,
          exercise: exercises.name,
          unit: exercises.unit,
          kind: personalRecords.kind,
          value: personalRecords.value,
          achievedAt: personalRecords.achievedAt
        })
        .from(personalRecords)
        .innerJoin(exercises, eq(personalRecords.exerciseId, exercises.id))
        .where(and(...conds))
        .orderBy(desc(personalRecords.achievedAt));
      return rows.map((r) => ({ ...r, value: num(r.value) }));
    }
  },
  {
    name: 'get_recommendations',
    title: 'Get next-session targets',
    description:
      "The app's pending progression targets for each exercise (what to do next time), with the engine's rationale.",
    scope: 'read',
    readOnly: true,
    inputSchema: obj(),
    run: (auth) => getPendingRecommendations(auth.userId)
  },
  {
    name: 'get_routines',
    title: 'Get routines',
    description: "The user's exercise groups (e.g. Push, Legs), which exercises are in each, and the weekly schedule (0=Sunday).",
    scope: 'read',
    readOnly: true,
    inputSchema: obj(),
    async run(auth) {
      const [groups, schedule, memberships] = await Promise.all([
        listGroups(auth.userId),
        getWeeklySchedule(auth.userId),
        getAllMemberships(auth.userId)
      ]);
      return {
        groups: groups.map((g) => ({
          ...g,
          exerciseIds: memberships.filter((m) => m.groupId === g.id).map((m) => m.exerciseId)
        })),
        weeklySchedule: schedule
      };
    }
  },
  {
    name: 'export_all_data',
    title: 'Export all data',
    description:
      "Everything stored for the user in one JSON document (workouts, sets, cardio, goals, PRs, targets, routines, comments). Can be large — prefer the narrower tools for specific questions.",
    scope: 'read',
    readOnly: true,
    inputSchema: obj(),
    async run(auth) {
      const [u] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, auth.userId));
      return exportUserData(u);
    }
  },
  {
    name: 'list_comments',
    title: 'List comments',
    description: 'Comments on the user\'s data, newest first. Filter by target.',
    scope: 'read',
    readOnly: true,
    inputSchema: obj({
      targetType: { type: 'string', enum: COMMENT_TARGETS },
      targetId: uuidProp('Id of the workout / exercise / set.'),
      limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Default 100.' }
    }),
    run: (auth, args) =>
      listComments(auth.userId, {
        targetType: targetType(args, false) ?? undefined,
        targetId: uuid(args, 'targetId', false),
        limit: int(args, 'limit', 100, 500)
      })
  },
  {
    name: 'add_comment',
    title: 'Add comment',
    description:
      "Leave a comment the user will see in the app — e.g. coaching feedback on a workout, an exercise's progress, or a specific set. targetType 'general' (no targetId) is an overall note. Plain text, be concise.",
    scope: 'comment',
    readOnly: false,
    inputSchema: obj(
      {
        targetType: { type: 'string', enum: COMMENT_TARGETS },
        targetId: uuidProp("Id of the workout / exercise / set. Omit for 'general'."),
        body: { type: 'string', minLength: 1, maxLength: 4000 }
      },
      ['targetType', 'body']
    ),
    async run(auth, args) {
      const type = targetType(args, true)!;
      const targetId = type === 'general' ? null : uuid(args, 'targetId', true);
      const body = str(args, 'body', true)!.trim();
      if (!body) throw new ToolError('"body" must not be empty.');
      if (body.length > 4000) throw new ToolError('"body" is limited to 4000 characters.');
      if (!(await targetExists(auth.userId, type, targetId))) {
        throw new ToolError(`No ${type} with that id belongs to this user.`);
      }
      return addComment(auth.userId, {
        targetType: type,
        targetId,
        body,
        author: auth.clientName,
        clientId: auth.clientId
      });
    }
  },
  {
    name: 'delete_comment',
    title: 'Delete comment',
    description: 'Remove a comment by id (e.g. one that is outdated).',
    scope: 'comment',
    readOnly: false,
    inputSchema: obj({ commentId: uuidProp('Comment id.') }, ['commentId']),
    async run(auth, args) {
      const ok = await deleteComment(auth.userId, uuid(args, 'commentId')!);
      if (!ok) throw new ToolError('Comment not found.');
      return { deleted: true };
    }
  }
];

function targetType(args: Args, required: boolean): CommentTarget | null {
  const t = str(args, 'targetType', required);
  if (t && !COMMENT_TARGETS.includes(t as CommentTarget)) {
    throw new ToolError(`"targetType" must be one of: ${COMMENT_TARGETS.join(', ')}.`);
  }
  return t as CommentTarget | null;
}
