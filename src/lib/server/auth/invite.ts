import { desc, eq, sql } from 'drizzle-orm';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { db } from '$lib/server/db';
import { invites } from '$lib/server/db/schema';
import { env } from '$lib/server/config';

// Unambiguous alphabet (no 0/O/1/I) for codes read off a screen.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomBlock(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Human-friendly invite code, e.g. OVL-7Q2M-K9TX. */
export function generateInviteCode(): string {
  return `OVL-${randomBlock(4)}-${randomBlock(4)}`;
}

export function hashCode(code: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(code.trim().toUpperCase())));
}

export async function createInvite(opts: {
  createdBy: string;
  note?: string | null;
  maxUses?: number;
  expiresInDays?: number | null;
}): Promise<{ code: string; id: string }> {
  const code = generateInviteCode();
  const days = opts.expiresInDays ?? env.INVITE_DEFAULT_EXPIRY_DAYS;
  const expiresAt = days && days > 0 ? new Date(Date.now() + days * 86_400_000) : null;

  const [row] = await db
    .insert(invites)
    .values({
      codeHash: hashCode(code),
      createdBy: opts.createdBy,
      note: opts.note ?? null,
      maxUses: opts.maxUses ?? 1,
      expiresAt
    })
    .returning({ id: invites.id });

  return { code, id: row.id };
}

type InviteCheck =
  | { ok: true; id: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'exhausted' };

export async function validateInvite(code: string): Promise<InviteCheck> {
  const [row] = await db.select().from(invites).where(eq(invites.codeHash, hashCode(code)));
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (row.uses >= row.maxUses) return { ok: false, reason: 'exhausted' };
  return { ok: true, id: row.id };
}

/** List invites for the admin screen (never returns the code itself). */
export async function listInvites() {
  const rows = await db
    .select({
      id: invites.id,
      note: invites.note,
      maxUses: invites.maxUses,
      uses: invites.uses,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt
    })
    .from(invites)
    .orderBy(desc(invites.createdAt));

  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    status:
      r.uses >= r.maxUses
        ? 'exhausted'
        : r.expiresAt && r.expiresAt.getTime() < now
          ? 'expired'
          : 'active'
  }));
}

/** Revoke an invite by exhausting it. */
export async function revokeInvite(id: string) {
  await db.update(invites).set({ maxUses: 0 }).where(eq(invites.id, id));
}

/** Atomically consume one use; returns false if it was raced to exhaustion. */
export async function consumeInvite(inviteId: string): Promise<boolean> {
  const result = await db
    .update(invites)
    .set({ uses: sql`${invites.uses} + 1` })
    .where(sql`${invites.id} = ${inviteId} AND ${invites.uses} < ${invites.maxUses}`)
    .returning({ id: invites.id });
  return result.length > 0;
}
