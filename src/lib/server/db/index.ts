import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// A single shared connection pool for the app.
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20
});

export const db = drizzle(client, { schema, casing: 'snake_case' });
export { client };
export * as tables from './schema';
