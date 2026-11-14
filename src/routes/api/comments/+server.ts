import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { COMMENT_TARGETS, listComments } from '$lib/server/services/comments';
import type { CommentTarget } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/** Comments on the user's data. ?targetType=&targetId= to filter. */
export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireUser(locals);
  const targetType = url.searchParams.get('targetType') as CommentTarget | null;
  if (targetType && !COMMENT_TARGETS.includes(targetType)) throw error(400, 'Bad targetType');
  return json(
    await listComments(user.id, {
      targetType: targetType ?? undefined,
      targetId: url.searchParams.get('targetId'),
      limit: Number(url.searchParams.get('limit') ?? 50) || 50
    })
  );
};
