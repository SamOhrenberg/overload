import {
  listGroups,
  getWeeklySchedule,
  getAllMemberships
} from '$lib/server/services/routines';
import { listExercises } from '$lib/server/services/exercises';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user!;
  const [groups, exercises, schedule, memberships] = await Promise.all([
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
    exercises: exercises.map((e) => ({
      id: e.id,
      name: e.name,
      modality: e.modality,
      defaultGoal: e.defaultGoal
    }))
  };
};
