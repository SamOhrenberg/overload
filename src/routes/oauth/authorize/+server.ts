import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { verifyPassword } from '$lib/server/auth/password';
import {
  SCOPES,
  getClient,
  issueCode,
  parseScope,
  type Scope
} from '$lib/server/auth/oauth';
import { rateLimit } from '$lib/server/ratelimit';
import type { RequestHandler } from './$types';

/**
 * OAuth consent screen. Served by the API server itself (not the SPA) so it
 * works no matter where the UI is hosted. Signs in with username + password,
 * or reuses an existing same-origin session cookie.
 */

type AuthParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  responseType: string;
  scope: Scope[];
  resource: string | null;
};

function readParams(src: URLSearchParams | FormData): AuthParams {
  const g = (k: string) => String(src.get(k) ?? '');
  return {
    clientId: g('client_id'),
    redirectUri: g('redirect_uri'),
    state: g('state'),
    codeChallenge: g('code_challenge'),
    codeChallengeMethod: g('code_challenge_method') || 'plain',
    responseType: g('response_type'),
    scope: parseScope(g('scope')),
    resource: g('resource') || null
  };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const SECURITY_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  // Not 'no-referrer': that makes browsers send `Origin: null` on the consent
  // form's POST, which the CSRF check (hooks.server.ts) then rejects.
  'Referrer-Policy': 'same-origin'
};

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Overload</title>
<style>
:root{--bg:#f6f6f4;--surface:#fff;--fg:#151515;--fg2:#5d5d5a;--border:#dcdcd6;--accent:#e4572e;--on:#fff;--danger:#b42318;--dsoft:#fde8e6}
@media (prefers-color-scheme:dark){:root{--bg:#0f0f10;--surface:#1a1a1c;--fg:#f2f2f0;--fg2:#a3a3a0;--border:#323236;--danger:#ff8a80;--dsoft:#3a1d1b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,-apple-system,sans-serif;display:flex;min-height:100dvh;align-items:center;justify-content:center;padding:16px}
main{width:100%;max-width:380px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px}
h1{margin:0 0 4px;font-size:22px}h1 b{color:var(--accent)}p{margin:0 0 12px;color:var(--fg2);font-size:14px}
ul{margin:0 0 16px;padding-left:20px;font-size:14px}strong{color:var(--fg)}
input{display:block;width:100%;height:44px;margin:0 0 10px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--fg);font-size:16px}
.row{display:flex;gap:8px;margin-top:8px}button{flex:1;height:46px;border-radius:10px;border:1px solid var(--border);font-weight:700;font-size:15px;cursor:pointer;background:var(--surface);color:var(--fg)}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--on)}
.err{background:var(--dsoft);color:var(--danger);padding:8px 12px;border-radius:8px}
code{font-size:12px;word-break:break-all}
</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: SECURITY_HEADERS });
}

function errorPage(message: string, status = 400) {
  return page('Authorization error', `<h1><b>O</b>verload</h1><p class="err">${esc(message)}</p>`, status);
}

function redirectTo(uri: string, params: Record<string, string>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString(), 'Cache-Control': 'no-store' } });
}

/**
 * Validate the request. Problems with the client or redirect URI are shown on
 * screen (never redirected — that's how open redirects happen); everything else
 * is reported back to the client via the redirect URI.
 */
type Validated =
  | { fatal: Response; client?: undefined }
  | { fatal?: undefined; client: NonNullable<Awaited<ReturnType<typeof getClient>>> };

async function validate(p: AuthParams, origin: string): Promise<Validated> {
  const client = p.clientId ? await getClient(p.clientId) : null;
  if (!client) return { fatal: errorPage('Unknown application (client_id).') };
  if (!client.redirectUris.includes(p.redirectUri)) {
    return { fatal: errorPage('This redirect address is not registered for the application.') };
  }
  const fail = (error: string, description: string): Validated => ({
    fatal: redirectTo(p.redirectUri, { error, error_description: description, state: p.state, iss: origin })
  });
  if (p.responseType !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported.');
  if (!p.codeChallenge || p.codeChallengeMethod !== 'S256') {
    return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
  }
  if (!p.scope.length) return fail('invalid_scope', `Supported scopes: ${Object.keys(SCOPES).join(' ')}`);
  if (p.resource && p.resource.replace(/\/$/, '') !== `${origin}/mcp`) {
    return fail('invalid_target', 'Unknown resource.');
  }
  return { client };
}

function consentForm(
  p: AuthParams,
  clientName: string,
  signedInAs: string | null,
  error: string | null
) {
  const hidden = (
    [
      ['client_id', p.clientId],
      ['redirect_uri', p.redirectUri],
      ['state', p.state],
      ['code_challenge', p.codeChallenge],
      ['code_challenge_method', p.codeChallengeMethod],
      ['response_type', p.responseType],
      ['scope', p.scope.join(' ')],
      ['resource', p.resource ?? '']
    ] as const
  )
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`)
    .join('');

  const host = (() => {
    try {
      return new URL(p.redirectUri).host || p.redirectUri;
    } catch {
      return p.redirectUri;
    }
  })();

  const login = signedInAs
    ? `<p>Signed in as <strong>${esc(signedInAs)}</strong>.</p>`
    : `<input name="username" placeholder="Username" autocomplete="username" autocapitalize="off" required>
       <input name="password" type="password" placeholder="Password" autocomplete="current-password" required>`;

  return page(
    'Authorize',
    `<h1><b>O</b>verload</h1>
<p><strong>${esc(clientName)}</strong> wants to connect to your account.</p>
<p>It will be able to:</p>
<ul>${p.scope.map((s) => `<li>${esc(SCOPES[s])}</li>`).join('')}</ul>
<p>You'll be sent back to <code>${esc(host)}</code>. You can disconnect it any time under Me → Connected apps.</p>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post">${hidden}${login}
<div class="row"><button name="decision" value="deny" formnovalidate>Deny</button><button class="primary" name="decision" value="allow">Allow</button></div>
</form>`
  );
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const p = readParams(url.searchParams);
  const v = await validate(p, url.origin);
  if (v.fatal) return v.fatal;
  return consentForm(p, v.client.name, locals.user?.username ?? null, null);
};

export const POST: RequestHandler = async ({ request, url, locals, getClientAddress }) => {
  const form = await request.formData();
  const p = readParams(form);
  const v = await validate(p, url.origin);
  if (v.fatal) return v.fatal;

  if (form.get('decision') !== 'allow') {
    return redirectTo(p.redirectUri, {
      error: 'access_denied',
      error_description: 'The user denied access.',
      state: p.state,
      iss: url.origin
    });
  }

  let userId = locals.user?.id ?? null;
  if (!userId) {
    if (!rateLimit(`login:${getClientAddress()}`, 10, 60_000)) {
      return consentForm(p, v.client.name, null, 'Too many attempts. Try again shortly.');
    }
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = lower(${username})`);
    const ok = user ? await verifyPassword(user.passwordHash, password) : false;
    if (!user || !ok) return consentForm(p, v.client.name, null, 'Incorrect username or password.');
    userId = user.id;
  }

  const code = await issueCode({
    clientId: p.clientId,
    userId,
    redirectUri: p.redirectUri,
    codeChallenge: p.codeChallenge,
    scope: p.scope,
    resource: p.resource
  });
  return redirectTo(p.redirectUri, { code, state: p.state, iss: url.origin });
};
