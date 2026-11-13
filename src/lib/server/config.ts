/**
 * Central environment configuration. All operational config comes from
 * environment variables (no settings UI). Validated once at startup so a
 * misconfigured deployment fails loudly and early.
 *
 * Read via SvelteKit's $env/dynamic/private so values resolve in dev (from
 * .env) and in production (from the container's real environment) alike.
 */
import { env as runtimeEnv } from '$env/dynamic/private';

// Read a required var without throwing at import time — validated at startup
// by assertEnv() instead, so the build (which imports server modules) works
// without a database present.
function required(name: string): string {
  return runtimeEnv[name] ?? '';
}

function optional(name: string, fallback: string): string {
  const v = runtimeEnv[name];
  return v && v.trim() !== '' ? v : fallback;
}

function int(name: string, fallback: number): number {
  const v = runtimeEnv[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = runtimeEnv[name];
  if (v === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(v);
}

export const env = {
  ORIGIN: optional('ORIGIN', 'http://localhost:3000'),
  PORT: int('PORT', 3000),
  DATABASE_URL: required('DATABASE_URL'),
  SESSION_SECRET: required('SESSION_SECRET'),
  TZ: optional('TZ', 'UTC'),
  LOG_LEVEL: optional('LOG_LEVEL', 'info'),

  ADMIN_USERNAME: runtimeEnv.ADMIN_USERNAME ?? '',
  ADMIN_PASSWORD: runtimeEnv.ADMIN_PASSWORD ?? '',
  ADMIN_EMAIL: runtimeEnv.ADMIN_EMAIL ?? '',

  // UI origins allowed to call the API cross-origin (e.g. a GitHub Pages host).
  CORS_ALLOWED_ORIGINS: optional('CORS_ALLOWED_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  AUTH_TOKENS_ENABLED: bool('AUTH_TOKENS_ENABLED', true),

  DEFAULT_UNIT: optional('DEFAULT_UNIT', 'lb') as 'lb' | 'kg',
  INVITE_DEFAULT_EXPIRY_DAYS: int('INVITE_DEFAULT_EXPIRY_DAYS', 14),
  REST_TIMER_DEFAULT_SEC: int('REST_TIMER_DEFAULT_SEC', 120),
  WEEK_START: optional('WEEK_START', 'monday') as 'monday' | 'sunday',

  AI_ENABLED: bool('AI_ENABLED', false),
  AI_PROVIDER: runtimeEnv.AI_PROVIDER ?? '',
  AI_BASE_URL: runtimeEnv.AI_BASE_URL ?? '',
  AI_API_KEY: runtimeEnv.AI_API_KEY ?? '',
  AI_MODEL: runtimeEnv.AI_MODEL ?? ''
};

export type Env = typeof env;

/** Validate required configuration. Called once at startup (see bootstrap). */
export function assertEnv() {
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!env.SESSION_SECRET) missing.push('SESSION_SECRET');
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}
