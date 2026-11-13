import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$lib/server/config';
import * as schema from './schema';

type DB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DB | null = null;

// Lazily create the connection pool on first use, so importing this module
// (e.g. during the build's route analysis) has no side effects and needs no
// live database.
function init(): DB {
  if (!_db) {
    const client = postgres(env.DATABASE_URL, { max: 10, idle_timeout: 20 });
    _db = drizzle(client, { schema, casing: 'snake_case' });
  }
  return _db;
}

export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const real = init() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  }
});

export * as tables from './schema';
