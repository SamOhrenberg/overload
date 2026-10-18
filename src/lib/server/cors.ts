import { env } from '$lib/server/config';

/** Resolve the allowed CORS origin for a request, if any. */
export function allowedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;
  if (env.CORS_ALLOWED_ORIGINS.includes('*')) return requestOrigin;
  return env.CORS_ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : null;
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}
