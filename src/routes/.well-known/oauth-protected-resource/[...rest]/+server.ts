import { json } from '@sveltejs/kit';
import { protectedResourceMetadata } from '$lib/server/auth/oauth';
import type { RequestHandler } from './$types';

/** RFC 9728 metadata for the /mcp resource. */
export const GET: RequestHandler = ({ url }) => json(protectedResourceMetadata(url.origin));
