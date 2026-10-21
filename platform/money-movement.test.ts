import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '@/platform/db/client';
import { auditEvents } from '@/platform/db/schema';
import { ledgerTransactions, payments, refunds } from '@/mock-vendors/schema';
import { inProcessFetch, signInAs } from '@/tests/helpers';

vi.mock('@/platform/registry.generated', async () => {
  const { manifest, access } = await import('@/tests/fixtures/test-module');
  return { modules: [{ manifest, access }] };
});

import { refund, refundCalls } from '@/tests/fixtures/actions';

const KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
let dropped = false;

describe('money movement: exactly-once on retry', () => {
  beforeEach(async () => {
    await sql`TRUNCATE audit_events`;
    await sql`TRUNCATE approval_requests`;
    refundCalls.length = 0;
    dropped = false;
    signInAs('alex');
    // The ledger POST reaches the vendor, then the response is lost on the wire.
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const res = await inProcessFetch(input, init);
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (!dropped && url.includes('/api/mock/ledger/') && method === 'POST') {
        dropped = true;
        throw new Error('simulated network drop');
      }
      return res;
    });
  });

  it('refund + ledger post are retried exactly once', async () => {
    const rows = await db.select().from(payments).where(eq(payments.status, 'succeeded'));
    const p = rows.find((r) => r.amountRefunded === 0 && r.amount >= 10_000);
    if (!p) throw new Error('no suitable seeded payment');

    const input = { paymentId: p.id, amount: 5_000, idempotencyKey: KEY };
    const first = await refund(input);
    expect(first).toMatchObject({ ok: false, error: 'FAILED' });

    const failedRow = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.status, 'failed'));
    const refundId = (failedRow[0].result as { refundId: string }).refundId;
    expect(refundId).toMatch(/^re_/);

    const second = await refund(input);
    expect(second).toMatchObject({ ok: true, status: 'succeeded' });
    if (!(second.ok && second.status === 'succeeded')) throw new Error('unreachable');
    expect(second.data.refundId).toBe(refundId);
    expect(second.data.duplicate).toBe(true);

    const refundsForPayment = await db.select().from(refunds).where(eq(refunds.paymentId, p.id));
    expect(refundsForPayment).toHaveLength(1);
    const ledgerTx = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.externalId, refundId));
    expect(ledgerTx).toHaveLength(1);
    expect(second.data.ledgerTransactionId).toBe(ledgerTx[0].id);

    const audit = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.idempotencyKey, KEY))
      .orderBy(auditEvents.id);
    expect(audit.map((r) => r.status)).toEqual(['attempted', 'failed', 'attempted', 'succeeded']);
    expect(new Set(audit.map((r) => r.attemptId)).size).toBe(2);
    expect(new Set(audit.map((r) => r.idempotencyKey)).size).toBe(1);
  });
});
