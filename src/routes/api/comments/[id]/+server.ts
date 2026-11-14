import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { deleteComment } from '$lib/server/services/comments';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  if (!(await deleteComment(user.id, params.id))) throw error(404, 'Comment not found');
  return new Response(null, { status: 204 });
};
