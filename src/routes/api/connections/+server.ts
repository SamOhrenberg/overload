import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http';
import { listConnections } from '$lib/server/auth/oauth';
import type { RequestHandler } from './$types';

/** Apps (MCP clients) the user has authorized via OAuth and that still hold a live token. */
export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireUser(locals);
  return json({ mcpUrl: `${url.origin}/mcp`, connections: await listConnections(user.id) });
};
