import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/http';
import { createInvite, listInvites } from '$lib/server/auth/invite';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  requireAdmin(locals);
  return json(await listInvites());
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const admin = requireAdmin(locals);
  const body = await request.json().catch(() => ({}));
  // The plaintext code is returned exactly once, here.
  const invite = await createInvite({
    createdBy: admin.id,
    note: body.note ?? null,
    maxUses: body.maxUses ?? 1,
    expiresInDays: body.expiresInDays ?? undefined
  });
  return json(invite, { status: 201 });
};
