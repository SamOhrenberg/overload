import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  comments,
  exercises,
  sets,
  workoutExercises,
  workouts,
  type CommentTarget
} from '$lib/server/db/schema';

export const COMMENT_TARGETS: CommentTarget[] = ['workout', 'exercise', 'set', 'general'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CommentItem = {
  id: string;
  targetType: CommentTarget;
  targetId: string | null;
  body: string;
  author: string;
  createdAt: string;
};

const toItem = (r: typeof comments.$inferSelect): CommentItem => ({
  id: r.id,
  targetType: r.targetType,
  targetId: r.targetId,
  body: r.body,
  author: r.author,
  createdAt: r.createdAt.toISOString()
});

/** True if the target exists and is visible to this user. */
export async function targetExists(
  userId: string,
  type: CommentTarget,
  id: string | null
): Promise<boolean> {
  if (type === 'general') return id == null;
  if (!id || !UUID.test(id)) return false;
  if (type === 'workout') {
    const [r] = await db
      .select({ id: workouts.id })
      .from(workouts)
      .where(and(eq(workouts.id, id), eq(workouts.userId, userId)));
    return !!r;
  }
  if (type === 'exercise') {
    const [r] = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.id, id), or(isNull(exercises.ownerId), eq(exercises.ownerId, userId))));
    return !!r;
  }
  const [r] = await db
    .select({ id: sets.id })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(eq(sets.id, id), eq(workouts.userId, userId)));
  return !!r;
}

export async function addComment(
  userId: string,
  data: {
    targetType: CommentTarget;
    targetId: string | null;
    body: string;
    author: string;
    clientId?: string | null;
  }
): Promise<CommentItem> {
  const [row] = await db
    .insert(comments)
    .values({
      userId,
      targetType: data.targetType,
      targetId: data.targetId,
      body: data.body,
      author: data.author.slice(0, 100),
      clientId: data.clientId ?? null
    })
    .returning();
  return toItem(row);
}

export async function listComments(
  userId: string,
  filter: { targetType?: CommentTarget; targetId?: string | null; limit?: number } = {}
): Promise<CommentItem[]> {
  const conds = [eq(comments.userId, userId)];
  if (filter.targetType) conds.push(eq(comments.targetType, filter.targetType));
  if (filter.targetId) conds.push(eq(comments.targetId, filter.targetId));
  const rows = await db
    .select()
    .from(comments)
    .where(and(...conds))
    .orderBy(desc(comments.createdAt))
    .limit(Math.min(filter.limit ?? 100, 500));
  return rows.map(toItem);
}

/** Comments on a workout itself plus any on its sets. */
export async function commentsForWorkout(userId: string, workoutId: string): Promise<CommentItem[]> {
  const setRows = await db
    .select({ id: sets.id })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(eq(workoutExercises.workoutId, workoutId));
  const setIds = setRows.map((s) => s.id);
  const onWorkout = and(eq(comments.targetType, 'workout'), eq(comments.targetId, workoutId));
  const onSets = setIds.length
    ? and(eq(comments.targetType, 'set'), inArray(comments.targetId, setIds))
    : undefined;
  const rows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.userId, userId), onSets ? or(onWorkout, onSets) : onWorkout))
    .orderBy(comments.createdAt);
  return rows.map(toItem);
}

/** Owner-scoped delete. Returns false if not found. */
export async function deleteComment(userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db
    .delete(comments)
    .where(and(eq(comments.id, id), eq(comments.userId, userId)))
    .returning({ id: comments.id });
  return rows.length > 0;
}
