import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$lib/server/config';
import * as schema from './schema';

// A single shared connection pool for the app.
const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20
});

export const db = drizzle(client, { schema, casing: 'snake_case' });
export { client };
export * as tables from './schema';
