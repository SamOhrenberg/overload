/**
 * Minimal OAuth 2.1 authorization server for MCP clients (Claude, etc.):
 *  - RFC 8414 authorization-server metadata, RFC 9728 protected-resource metadata
 *  - RFC 7591 dynamic client registration (public clients, no secret)
 *  - authorization code + PKCE (S256 only), refresh-token rotation
 *
 * Tokens are opaque random strings; only their sha256 is stored. OAuth tokens
 * are separate from app sessions — they authorize /mcp only, never /api/*.
 */
import { and, eq, lt } from 'drizzle-orm';
import { sha256 } from '@oslojs/crypto/sha2';
import {
  encodeBase32LowerCaseNoPadding,
  encodeBase64urlNoPadding,
  encodeHexLowerCase
} from '@oslojs/encoding';
import { db } from '$lib/server/db';
import { oauthClients, oauthCodes, oauthTokens } from '$lib/server/db/schema';

export const SCOPES = {
  read: 'Read all of your training data',
  comment: 'Leave and remove comments on your data',
  write: 'Log, edit and delete your workouts, exercises, goals and routines'
} as const;
export type Scope = keyof typeof SCOPES;
export const ALL_SCOPES = Object.keys(SCOPES) as Scope[];

const MINUTE = 60_000;
const CODE_TTL = 10 * MINUTE;
const ACCESS_TTL = 60 * MINUTE;
const REFRESH_TTL = 30 * 24 * 60 * MINUTE;

function randomToken(bytes = 32): string {
  return encodeBase32LowerCaseNoPadding(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function hashToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

/** Normalize a requested scope string to known scopes; empty → all. */
export function parseScope(raw: string | null | undefined): Scope[] {
  const asked = (raw ?? '').split(/\s+/).filter(Boolean);
  if (!asked.length) return ALL_SCOPES;
  return ALL_SCOPES.filter((s) => asked.includes(s));
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    scopes_supported: ALL_SCOPES,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256']
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'Overload'
  };
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

/**
 * A redirect URI we're willing to send codes to: https anywhere, http only on
 * loopback (native/CLI clients), or a private-use scheme (e.g. cursor://).
 * No fragments, and never script-capable schemes.
 */
export function isAcceptableRedirectUri(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash) return false;
  const scheme = u.protocol.slice(0, -1).toLowerCase();
  if (['javascript', 'data', 'vbscript', 'file', 'blob', 'about'].includes(scheme)) return false;
  if (scheme === 'https') return true;
  if (scheme === 'http') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  return /^[a-z][a-z0-9+.-]*$/.test(scheme);
}

export async function registerClient(name: string, redirectUris: string[]) {
  const id = randomToken(16);
  const [row] = await db
    .insert(oauthClients)
    .values({ id, name: name.slice(0, 100) || 'MCP client', redirectUris })
    .returning();
  return row;
}

export async function getClient(id: string) {
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, id));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Authorization codes
// ---------------------------------------------------------------------------

export async function issueCode(data: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: Scope[];
  resource: string | null;
}): Promise<string> {
  const code = randomToken();
  await db.insert(oauthCodes).values({
    id: hashToken(code),
    clientId: data.clientId,
    userId: data.userId,
    redirectUri: data.redirectUri,
    codeChallenge: data.codeChallenge,
    scope: data.scope.join(' '),
    resource: data.resource,
    expiresAt: new Date(Date.now() + CODE_TTL)
  });
  return code;
}

function s256(verifier: string): string {
  return encodeBase64urlNoPadding(sha256(new TextEncoder().encode(verifier)));
}

/** Single-use: the code row is deleted whether or not the exchange succeeds. */
export async function redeemCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const [row] = await db
    .delete(oauthCodes)
    .where(eq(oauthCodes.id, hashToken(params.code)))
    .returning();
  if (!row) return null;
  if (Date.now() >= row.expiresAt.getTime()) return null;
  if (row.clientId !== params.clientId || row.redirectUri !== params.redirectUri) return null;
  if (!params.codeVerifier || s256(params.codeVerifier) !== row.codeChallenge) return null;
  return row;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export type TokenResponse = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export async function issueTokens(data: {
  clientId: string;
  userId: string;
  scope: string;
  resource: string | null;
}): Promise<TokenResponse> {
  const access = randomToken();
  const refresh = randomToken();
  const now = Date.now();
  await db.insert(oauthTokens).values([
    {
      id: hashToken(access),
      kind: 'access',
      ...data,
      expiresAt: new Date(now + ACCESS_TTL)
    },
    {
      id: hashToken(refresh),
      kind: 'refresh',
      ...data,
      expiresAt: new Date(now + REFRESH_TTL)
    }
  ]);
  // Opportunistic cleanup of expired rows.
  await db.delete(oauthTokens).where(lt(oauthTokens.expiresAt, new Date(now)));
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date(now)));
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL / 1000,
    refresh_token: refresh,
    scope: data.scope
  };
}

/** Rotate a refresh token: the old one is consumed, a new pair is issued. */
export async function refreshTokens(refreshToken: string, clientId: string, scope?: Scope[]) {
  const [row] = await db
    .delete(oauthTokens)
    .where(and(eq(oauthTokens.id, hashToken(refreshToken)), eq(oauthTokens.kind, 'refresh')))
    .returning();
  if (!row || row.clientId !== clientId || Date.now() >= row.expiresAt.getTime()) return null;
  // A refresh may narrow scope, never widen it.
  const granted = row.scope.split(' ');
  const next = scope?.length ? scope.filter((s) => granted.includes(s)) : granted;
  return issueTokens({
    clientId,
    userId: row.userId,
    scope: next.join(' '),
    resource: row.resource
  });
}

export type McpAuth = {
  userId: string;
  clientId: string;
  clientName: string;
  scopes: Scope[];
};

/** Validate an access token presented to /mcp. */
export async function validateAccessToken(token: string, resource: string): Promise<McpAuth | null> {
  const [row] = await db
    .select({
      kind: oauthTokens.kind,
      userId: oauthTokens.userId,
      clientId: oauthTokens.clientId,
      scope: oauthTokens.scope,
      resource: oauthTokens.resource,
      expiresAt: oauthTokens.expiresAt,
      clientName: oauthClients.name
    })
    .from(oauthTokens)
    .innerJoin(oauthClients, eq(oauthTokens.clientId, oauthClients.id))
    .where(eq(oauthTokens.id, hashToken(token)));
  if (!row || row.kind !== 'access') return null;
  if (Date.now() >= row.expiresAt.getTime()) return null;
  // Audience check (RFC 8707): a token minted for another resource is rejected.
  if (row.resource && row.resource.replace(/\/$/, '') !== resource) return null;
  return {
    userId: row.userId,
    clientId: row.clientId,
    clientName: row.clientName,
    scopes: row.scope.split(' ').filter(Boolean) as Scope[]
  };
}

export async function revokeToken(token: string) {
  await db.delete(oauthTokens).where(eq(oauthTokens.id, hashToken(token)));
}

// ---------------------------------------------------------------------------
// Connected apps (for the Me screen)
// ---------------------------------------------------------------------------

export async function listConnections(userId: string) {
  const rows = await db
    .select({
      clientId: oauthTokens.clientId,
      name: oauthClients.name,
      scope: oauthTokens.scope,
      createdAt: oauthTokens.createdAt,
      expiresAt: oauthTokens.expiresAt
    })
    .from(oauthTokens)
    .innerJoin(oauthClients, eq(oauthTokens.clientId, oauthClients.id))
    .where(eq(oauthTokens.userId, userId));

  const byClient = new Map<
    string,
    { clientId: string; name: string; scopes: string[]; lastAuthorized: string }
  >();
  const now = Date.now();
  for (const r of rows) {
    if (r.expiresAt.getTime() <= now) continue;
    const prev = byClient.get(r.clientId);
    const at = r.createdAt.toISOString();
    if (!prev) {
      byClient.set(r.clientId, {
        clientId: r.clientId,
        name: r.name,
        scopes: r.scope.split(' ').filter(Boolean),
        lastAuthorized: at
      });
    } else if (at > prev.lastAuthorized) {
      prev.lastAuthorized = at;
    }
  }
  return [...byClient.values()].sort((a, b) => b.lastAuthorized.localeCompare(a.lastAuthorized));
}

export async function revokeConnection(userId: string, clientId: string) {
  await db
    .delete(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.clientId, clientId)));
  await db
    .delete(oauthCodes)
    .where(and(eq(oauthCodes.userId, userId), eq(oauthCodes.clientId, clientId)));
}
