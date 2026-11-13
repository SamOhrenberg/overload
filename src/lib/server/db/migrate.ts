import postgres from 'postgres';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Locate the drizzle/ migrations directory. The reliable anchor is the working
 * directory — the Dockerfile copies drizzle to /app/drizzle and the container
 * runs from /app, and `node build/index.js` is likewise run from the project
 * root. We still fall back to a few paths relative to this module's bundled
 * location, whose depth shifts with the adapter's output structure, so a change
 * there can't silently break migrations (which would 500 the whole app on boot).
 */
function resolveMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), 'drizzle'),
    join(here, '..', '..', '..', '..', 'drizzle'),
    join(here, '..', '..', '..', 'drizzle'),
    join(here, '..', '..', 'drizzle'),
    join(here, '..', 'drizzle')
  ];
  const found = candidates.find((d) => existsSync(d) && statSync(d).isDirectory());
  if (!found) {
    throw new Error(`Migrations directory not found. Tried:\n  ${candidates.join('\n  ')}`);
  }
  return found;
}

/**
 * Minimal forward-only migration runner. Applies every *.sql file in
 * ./drizzle in filename order exactly once, tracked in _migrations.
 * Kept deliberately simple so the whole data story lives in plain SQL.
 */
export async function runMigrations(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const sql = postgres(connectionString, { max: 1 });

  const dir = resolveMigrationsDir();

  try {
    await sql`CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;

    const applied = new Set(
      (await sql`SELECT name FROM _migrations`).map((r) => r.name as string)
    );

    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const ddl = readFileSync(join(dir, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(ddl);
        await tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });
      console.log(`[migrate] applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}

// Allow running directly: `node build/migrate.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
