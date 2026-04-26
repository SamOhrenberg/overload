import { db } from './index';
import { exercises } from './schema';
import { sql } from 'drizzle-orm';

type SeedExercise = {
  name: string;
  modality: 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cardio';
  kind: 'resistance' | 'cardio' | 'mobility';
  muscleGroups: string[];
  unit: 'lb' | 'kg' | 'km' | 'mi' | 'min';
  loadIncrement: string | null;
  defaultGoal: 'strength' | 'endurance' | 'stamina' | null;
};

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
  { name: 'Running', modality: 'cardio', kind: 'cardio', muscleGroups: ['full-body'], unit: 'mi', loadIncrement: null, defaultGoal: 'stamina' },
  { name: 'Cycling', modality: 'cardio', kind: 'cardio', muscleGroups: ['legs'], unit: 'mi', loadIncrement: null, defaultGoal: 'stamina' },
  { name: 'Rowing', modality: 'cardio', kind: 'cardio', muscleGroups: ['full-body'], unit: 'km', loadIncrement: null, defaultGoal: 'stamina' },
  { name: 'Incline Treadmill Walk', modality: 'cardio', kind: 'cardio', muscleGroups: ['legs'], unit: 'min', loadIncrement: null, defaultGoal: 'stamina' },
  { name: 'Jump Rope', modality: 'cardio', kind: 'cardio', muscleGroups: ['calves', 'full-body'], unit: 'min', loadIncrement: null, defaultGoal: 'stamina' }
];

/** Insert built-ins that are not already present (idempotent by name). */
export async function seedBuiltInExercises() {
  for (const ex of BUILT_IN) {
    await db
      .insert(exercises)
      .values({
        ownerId: null,
        name: ex.name,
        modality: ex.modality,
        kind: ex.kind,
        muscleGroups: ex.muscleGroups,
        unit: ex.unit,
        loadIncrement: ex.loadIncrement,
        defaultGoal: ex.defaultGoal
      })
      .onConflictDoNothing();
  }

  const [{ count }] = await db.execute<{ count: string }>(
    sql`SELECT count(*)::int AS count FROM exercises WHERE owner_id IS NULL`
  );
  console.log(`[seed] built-in exercises present: ${count}`);
}
