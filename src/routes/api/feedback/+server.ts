import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { rateLimit } from '$lib/server/ratelimit';
import { FEEDBACK_KINDS, githubEnabled, listFeedback, submitFeedback } from '$lib/server/services/feedback';
import type { FeedbackKind } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireUser(locals);
  return json({ github: githubEnabled(), items: await listFeedback(user.id) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireUser(locals);
  if (!rateLimit(`feedback:${user.id}`, 10, 60 * 60 * 1000)) {
    throw error(429, 'Too much feedback at once — try again later');
  }
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const details = typeof body.body === 'string' ? body.body.trim().slice(0, 5000) : '';
  const kind: FeedbackKind = FEEDBACK_KINDS.includes(body.kind) ? body.kind : 'other';
  const context = typeof body.context === 'string' ? body.context.slice(0, 500) : null;
  if (!title) throw error(400, 'A short summary is required');
  return json(await submitFeedback(user.id, { kind, title, body: details, context }), { status: 201 });
};
