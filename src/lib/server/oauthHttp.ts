import { json } from '@sveltejs/kit';

/** Public OAuth/MCP endpoints are bearer-only (no cookies), so any origin may call them. */
export const OPEN_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400'
};

/** Paths that use OPEN_CORS instead of the app's allow-listed CORS. */
export function isOpenCorsPath(pathname: string): boolean {
  return (
    pathname === '/mcp' ||
    pathname.startsWith('/.well-known/oauth-') ||
    pathname === '/oauth/token' ||
    pathname === '/oauth/register' ||
    pathname === '/oauth/revoke'
  );
}

export function oauthError(error: string, description: string, status = 400) {
  return json(
    { error, error_description: description },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

/** Token/revoke endpoints accept form-encoded (per spec) or JSON (lenient) bodies. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    return ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  }
  const text = await request.text().catch(() => '');
  return Object.fromEntries(new URLSearchParams(text));
}
