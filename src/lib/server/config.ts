/**
 * Central environment configuration. All operational config comes from
 * environment variables (no settings UI). Validated once at startup so a
 * misconfigured deployment fails loudly and early.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : fallback;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
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

  ADMIN_USERNAME: process.env.ADMIN_USERNAME ?? '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? '',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? '',

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
  AI_PROVIDER: process.env.AI_PROVIDER ?? '',
  AI_BASE_URL: process.env.AI_BASE_URL ?? '',
  AI_API_KEY: process.env.AI_API_KEY ?? '',
  AI_MODEL: process.env.AI_MODEL ?? ''
};

export type Env = typeof env;
