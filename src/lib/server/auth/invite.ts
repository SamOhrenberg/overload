import { eq, sql } from 'drizzle-orm';
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

/** Atomically consume one use; returns false if it was raced to exhaustion. */
export async function consumeInvite(inviteId: string): Promise<boolean> {
  const result = await db
    .update(invites)
    .set({ uses: sql`${invites.uses} + 1` })
    .where(sql`${invites.id} = ${inviteId} AND ${invites.uses} < ${invites.maxUses}`)
    .returning({ id: invites.id });
  return result.length > 0;
}
