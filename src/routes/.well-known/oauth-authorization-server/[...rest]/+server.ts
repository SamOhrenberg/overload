import { json } from '@sveltejs/kit';
import { authServerMetadata } from '$lib/server/auth/oauth';
import type { RequestHandler } from './$types';

/** RFC 8414 metadata (also answers path-suffixed lookups like .../oauth-authorization-server/mcp). */
export const GET: RequestHandler = ({ url }) => json(authServerMetadata(url.origin));
