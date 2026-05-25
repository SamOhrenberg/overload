import { eq } from 'drizzle-orm';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import type { Cookies } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { authSessions, users } from '$lib/server/db/schema';

const SESSION_COOKIE = 'overload_session';
const DAY = 1000 * 60 * 60 * 24;
const SESSION_TTL = 30 * DAY;
const RENEW_WITHIN = 15 * DAY;

export type SessionUser = {
  id: string;
  username: string;
  role: 'admin' | 'member';
  defaultUnit: 'lb' | 'kg';
};

export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return encodeBase32LowerCaseNoPadding(bytes);
}

function sessionIdFromToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export async function createSession(token: string, userId: string) {
  const id = sessionIdFromToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL);
  await db.insert(authSessions).values({ id, userId, expiresAt });
  return { id, userId, expiresAt };
}

export async function validateSessionToken(
  token: string
): Promise<{ sessionId: string; user: SessionUser } | null> {
  const id = sessionIdFromToken(token);
  const [row] = await db
    .select({
      sessionId: authSessions.id,
      expiresAt: authSessions.expiresAt,
      id: users.id,
      username: users.username,
      role: users.role,
      defaultUnit: users.defaultUnit
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(eq(authSessions.id, id));

  if (!row) return null;

  if (Date.now() >= row.expiresAt.getTime()) {
    await db.delete(authSessions).where(eq(authSessions.id, id));
    return null;
  }

  // Sliding expiry: extend when inside the renewal window.
  if (row.expiresAt.getTime() - Date.now() < RENEW_WITHIN) {
    const expiresAt = new Date(Date.now() + SESSION_TTL);
    await db.update(authSessions).set({ expiresAt }).where(eq(authSessions.id, id));
  }

  return {
    sessionId: row.sessionId,
    user: { id: row.id, username: row.username, role: row.role, defaultUnit: row.defaultUnit }
  };
}

export async function invalidateSession(sessionId: string) {
  await db.delete(authSessions).where(eq(authSessions.id, sessionId));
}

export function setSessionCookie(cookies: Cookies, token: string, secure: boolean) {
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_TTL / 1000
  });
}

export function deleteSessionCookie(cookies: Cookies, secure: boolean) {
  cookies.set(SESSION_COOKIE, '', { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: 0 });
}

export function readSessionCookie(cookies: Cookies): string | null {
  return cookies.get(SESSION_COOKIE) ?? null;
}
