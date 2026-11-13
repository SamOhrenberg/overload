import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { runMigrations } from '$lib/server/db/migrate';
import { seedBuiltInExercises, seedDefaultGroupsForUsers } from '$lib/server/db/seed';
import { hashPassword } from '$lib/server/auth/password';
import { env, assertEnv } from '$lib/server/config';

let started: Promise<void> | null = null;

/** Run exactly once per process. Safe to await from every request. */
export function bootstrap(): Promise<void> {
  if (!started) started = run();
  return started;
}

async function run() {
  assertEnv();
  await runMigrations(env.DATABASE_URL);
  await seedBuiltInExercises();
  await ensureAdmin();
  // Back-fill starter routine groups for existing users (idempotent per user).
  await seedDefaultGroupsForUsers();
}

async function ensureAdmin() {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
  if (existing) return;

  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    throw new Error(
      'No admin account exists and ADMIN_USERNAME / ADMIN_PASSWORD are not set. ' +
        'Set them on first boot to create the initial admin.'
    );
  }

  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
  await db.insert(users).values({
    username: env.ADMIN_USERNAME,
    email: env.ADMIN_EMAIL || null,
    passwordHash,
    role: 'admin',
    defaultUnit: env.DEFAULT_UNIT
  });
  console.log(`[bootstrap] created initial admin "${env.ADMIN_USERNAME}"`);
}
