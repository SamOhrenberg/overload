import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  workouts,
  workoutExercises,
  sets,
  cardioBouts,
  exercises,
  exerciseGoals,
  personalRecords,
  recommendations,
  exerciseGroups,
  exerciseGroupMembers,
  routineSchedule,
  comments
} from '$lib/server/db/schema';

/** Full, portable JSON export of one user's own data. */
export async function exportUserData(user: { id: string; username: string }) {
  const myWorkouts = await db.select().from(workouts).where(eq(workouts.userId, user.id));
  const workoutIds = myWorkouts.map((w) => w.id);

  const entries = workoutIds.length
    ? await db.select().from(workoutExercises).where(inArray(workoutExercises.workoutId, workoutIds))
    : [];
  const entryIds = entries.map((e) => e.id);

  const [mySets, myBouts, myExercises, myGoals, myPrs, myRecs, myGroups, mySchedule, myComments] =
    await Promise.all([
      entryIds.length ? db.select().from(sets).where(inArray(sets.workoutExerciseId, entryIds)) : [],
      entryIds.length
        ? db.select().from(cardioBouts).where(inArray(cardioBouts.workoutExerciseId, entryIds))
        : [],
      db.select().from(exercises).where(eq(exercises.ownerId, user.id)),
      db.select().from(exerciseGoals).where(eq(exerciseGoals.userId, user.id)),
      db.select().from(personalRecords).where(eq(personalRecords.userId, user.id)),
      db.select().from(recommendations).where(eq(recommendations.userId, user.id)),
      db.select().from(exerciseGroups).where(eq(exerciseGroups.userId, user.id)),
      db.select().from(routineSchedule).where(eq(routineSchedule.userId, user.id)),
      db.select().from(comments).where(eq(comments.userId, user.id))
    ]);

  const groupIds = myGroups.map((g) => g.id);
  const myMembers = groupIds.length
    ? await db.select().from(exerciseGroupMembers).where(inArray(exerciseGroupMembers.groupId, groupIds))
    : [];

  // Names for every exercise referenced (built-in library ones included), so
  // the export is readable without the library.
  const usedIds = Array.from(new Set(entries.map((e) => e.exerciseId)));
  const usedExercises = usedIds.length
    ? await db
        .select({ id: exercises.id, name: exercises.name, unit: exercises.unit, kind: exercises.kind })
        .from(exercises)
        .where(inArray(exercises.id, usedIds))
    : [];

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    user: { username: user.username },
    exerciseNames: usedExercises,
    customExercises: myExercises,
    goals: myGoals,
    workouts: myWorkouts,
    workoutExercises: entries,
    sets: mySets,
    cardioBouts: myBouts,
    personalRecords: myPrs,
    recommendations: myRecs,
    groups: myGroups,
    groupMembers: myMembers,
    schedule: mySchedule,
    comments: myComments.map(({ clientId: _c, ...c }) => c)
  };
}
