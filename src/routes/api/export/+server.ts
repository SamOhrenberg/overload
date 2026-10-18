import { json } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { requireUser } from '$lib/server/http';
import { db } from '$lib/server/db';
import {
  workouts,
  workoutExercises,
  sets,
  cardioBouts,
  exercises,
  exerciseGoals,
  personalRecords
} from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/** Full, portable JSON export of a user's own data. */
export const GET: RequestHandler = async ({ locals }) => {
  const user = requireUser(locals);

  const myWorkouts = await db.select().from(workouts).where(eq(workouts.userId, user.id));
  const workoutIds = myWorkouts.map((w) => w.id);

  const entries = workoutIds.length
    ? await db.select().from(workoutExercises).where(inArray(workoutExercises.workoutId, workoutIds))
    : [];
  const entryIds = entries.map((e) => e.id);

  const [mySets, myBouts, myExercises, myGoals, myPrs] = await Promise.all([
    entryIds.length
      ? db.select().from(sets).where(inArray(sets.workoutExerciseId, entryIds))
      : [],
    entryIds.length
      ? db.select().from(cardioBouts).where(inArray(cardioBouts.workoutExerciseId, entryIds))
      : [],
    db.select().from(exercises).where(eq(exercises.ownerId, user.id)),
    db.select().from(exerciseGoals).where(eq(exerciseGoals.userId, user.id)),
    db.select().from(personalRecords).where(eq(personalRecords.userId, user.id))
  ]);

  return json(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { username: user.username },
      customExercises: myExercises,
      goals: myGoals,
      workouts: myWorkouts,
      workoutExercises: entries,
      sets: mySets,
      cardioBouts: myBouts,
      personalRecords: myPrs
    },
    { headers: { 'Content-Disposition': 'attachment; filename="overload-export.json"' } }
  );
};
