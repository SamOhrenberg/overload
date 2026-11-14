import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { feedbackComments } from '$lib/server/services/feedback';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw error(404, 'Not found');
  const comments = await feedbackComments(user.id, params.id);
  if (!comments) throw error(404, 'Not found');
  return json(comments);
};
