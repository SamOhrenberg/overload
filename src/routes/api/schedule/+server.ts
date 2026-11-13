import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { getWeeklySchedule, setDaySchedule } from '$lib/server/services/routines';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireUser(locals);
  return json(await getWeeklySchedule(user.id));
};

/** Replace the groups assigned to one weekday. body: { dayOfWeek, groupIds }. */
export const PUT: RequestHandler = async ({ locals, request }) => {
  const user = requireUser(locals);
  const body = await request.json().catch(() => ({}));
  const dow = Number(body.dayOfWeek);
  if (!Number.isInteger(dow) || dow < 0 || dow > 6) throw error(400, 'dayOfWeek 0-6 required');
  const groupIds = Array.isArray(body.groupIds) ? body.groupIds.filter((x: unknown) => typeof x === 'string') : [];
  await setDaySchedule(user.id, dow, groupIds);
  return json({ ok: true });
};
