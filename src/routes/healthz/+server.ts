import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    await db.execute(sql`SELECT 1`);
    return json({ status: 'ok', db: 'up' });
  } catch {
    return json({ status: 'degraded', db: 'down' }, { status: 503 });
  }
};
