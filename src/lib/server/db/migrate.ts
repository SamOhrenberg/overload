import postgres from 'postgres';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Minimal forward-only migration runner. Applies every *.sql file in
 * ./drizzle in filename order exactly once, tracked in _migrations.
 * Kept deliberately simple so the whole data story lives in plain SQL.
 */
export async function runMigrations(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const sql = postgres(connectionString, { max: 1 });

  const here = dirname(fileURLToPath(import.meta.url));
  // In the built output the SQL lives alongside at ../drizzle.
  const dir = join(here, '..', '..', '..', '..', 'drizzle');

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
