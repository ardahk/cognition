'use server';

import { z } from 'zod';
import { getSession } from '../auth/session';
import { decideApproval } from './service';

const decideInput = z.object({
  id: z.uuid(),
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
});

export async function decide(raw: unknown) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: 'UNAUTHENTICATED', message: 'Not signed in' };
  const obj = raw instanceof FormData ? Object.fromEntries(raw) : raw;
  const parsed = decideInput.safeParse(obj);
  if (!parsed.success) {
    return { ok: false as const, error: 'INVALID_INPUT', message: 'Invalid input' };
  }
  return decideApproval(session, parsed.data);
}
