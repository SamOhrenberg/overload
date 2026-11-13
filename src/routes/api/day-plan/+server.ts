import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { getDayPlan, setDayPlan } from '$lib/server/services/routines';
import type { RequestHandler } from './$types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireUser(locals);
  const date = url.searchParams.get('date') ?? '';
  if (!DATE_RE.test(date)) throw error(400, 'date=YYYY-MM-DD required');
  return json(await getDayPlan(user.id, date));
};

/**
 * Set the active groups for a single date — the same-day swap. An empty
 * groupIds clears the override and reverts the date to the weekly schedule.
 * Never mutates the recurring schedule. body: { date, groupIds }.
 */
export const PUT: RequestHandler = async ({ locals, request }) => {
  const user = requireUser(locals);
  const body = await request.json().catch(() => ({}));
  const date = String(body.date ?? '');
  if (!DATE_RE.test(date)) throw error(400, 'date=YYYY-MM-DD required');
  const groupIds = Array.isArray(body.groupIds)
    ? body.groupIds.filter((x: unknown) => typeof x === 'string')
    : [];
  await setDayPlan(user.id, date, groupIds);
  return json({ ok: true });
};
