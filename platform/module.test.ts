import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '@/platform/db/client';
import { auditEvents, approvalRequests } from '@/platform/db/schema';
import { signInAs, signOut, useInProcessVendors } from '@/tests/helpers';
import { payments } from '@/mock-vendors/schema';
import { moduleContext, money } from '@/platform/module';
import { manifest } from '@/tests/fixtures/test-module';

vi.mock('@/platform/registry.generated', async () => {
  const { manifest, access } = await import('@/tests/fixtures/test-module');
  return { modules: [{ manifest, access }] };
});

import { breakGlass, echo, echoCalls, fail, overreach, probe, refund, refundCalls } from '@/tests/fixtures/actions';

const KEY = '11111111-2222-3333-4444-555555555555';

async function auditRows(filter?: string) {
  return db
    .select()
    .from(auditEvents)
    .where(filter ? eq(auditEvents.idempotencyKey, filter) : undefined)
    .orderBy(auditEvents.id);
}

async function pickPayment(minAmount: number) {
  const rows = await db.select().from(payments).where(eq(payments.status, 'succeeded'));
  const p = rows.find((r) => r.amount - r.amountRefunded >= minAmount && r.amountRefunded === 0);
  if (!p) throw new Error('no suitable seeded payment');
  return p;
}

describe('defineAction', () => {
  beforeEach(async () => {
    await sql`TRUNCATE audit_events`;
    await sql`TRUNCATE approval_requests`;
    echoCalls.length = 0;
    refundCalls.length = 0;
    signInAs('alex');
    useInProcessVendors();
  });

  it('unauthenticated → UNAUTHENTICATED before input validation, no audit rows', async () => {
    signOut();
    const res = await echo({ message: 42 });
    expect(res).toMatchObject({ ok: false, error: 'UNAUTHENTICATED' });
    expect(await auditRows()).toHaveLength(0);
  });

  it('forbidden → FORBIDDEN before input validation, one denied row', async () => {
    signInAs('sam');
    const res = await echo({ message: 42 });
    expect(res).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('denied');
    expect(rows[0].actorEmail).toBe('sam@fernpay.test');
  });

  it('invalid input → INVALID_INPUT with issues, no handler call, no audit', async () => {
    const res = await refund({ paymentId: 42, amount: 'lots' });
    expect(res).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    if (!res.ok) expect(Object.keys(res.issues ?? {})).toContain('paymentId');
    expect(refundCalls).toHaveLength(0);
    expect(await auditRows()).toHaveLength(0);
  });

  it('success → attempted + succeeded sharing attempt id and the caller key', async () => {
    const p = await pickPayment(10_000);
    const res = await refund({ paymentId: p.id, amount: 5_000, idempotencyKey: KEY });
    expect(res).toMatchObject({ ok: true, status: 'succeeded' });
    const rows = await auditRows(KEY);
    expect(rows.map((r) => r.status)).toEqual(['attempted', 'succeeded']);
    expect(rows[0].attemptId).toBe(rows[1].attemptId);
    expect(rows.every((r) => r.idempotencyKey === KEY)).toBe(true);
    expect(rows[0].targetId).toBe(p.id);
    const result = rows[1].result as { refundId: string; ledgerTransactionId: string };
    expect(result.refundId).toMatch(/^re_/);
  });

  it('a handler that records nothing leaves result null, even though it returns data', async () => {
    const res = await echo({ message: 'hi', idempotencyKey: KEY });
    expect(res).toMatchObject({ ok: true, status: 'succeeded', data: { echoed: { message: 'hi' } } });
    const rows = await auditRows(KEY);
    expect(rows.map((r) => r.status)).toEqual(['attempted', 'succeeded']);
    expect(rows[1].result).toBeNull();
  });

  it('commits the attempted row before the handler runs (write-ahead)', async () => {
    const res = await probe({ idempotencyKey: KEY });
    expect(res).toMatchObject({ ok: true, status: 'succeeded' });
    if (res.ok && res.status === 'succeeded') {
      expect((res.data as { attemptedRows: number }).attemptedRows).toBe(1);
    }
  });

  it('handler throw → FAILED with attempted+failed and recorded partials', async () => {
    const res = await fail({ idempotencyKey: KEY });
    expect(res).toMatchObject({ ok: false, error: 'FAILED', message: 'boom' });
    const rows = await auditRows(KEY);
    expect(rows.map((r) => r.status)).toEqual(['attempted', 'failed']);
    expect(rows[1].error).toContain('boom');
    expect(rows[1].result).toMatchObject({ step: 'before-throw' });
  });

  it('pre approval → pending_approval, handler not called, dedupes on key', async () => {
    const p = await pickPayment(30_000);
    const input = { paymentId: p.id, amount: 30_000, idempotencyKey: KEY };
    const res = await refund(input);
    expect(res).toMatchObject({ ok: true, status: 'pending_approval' });
    expect(refundCalls).toHaveLength(0);
    const attempted = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.status, 'attempted'));
    expect(attempted).toHaveLength(0);
    if (res.ok && res.status === 'pending_approval') {
      const request = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, res.approvalId));
      expect(request[0].status).toBe('pending');
      expect(request[0].idempotencyKey).toBe(KEY);
      expect(request[0].input).toMatchObject({ paymentId: p.id, amount: 30_000 });
      // double-submit returns the same request, one audit row
      const res2 = await refund(input);
      expect(res2).toMatchObject({ ok: true, status: 'pending_approval', approvalId: res.approvalId });
      const pendingRows = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.status, 'pending_approval'));
      expect(pendingRows).toHaveLength(1);
    }
  });

  it('post-hoc → succeeds immediately and opens pending_review', async () => {
    const res = await breakGlass({ idempotencyKey: KEY });
    expect(res).toMatchObject({ ok: true, status: 'succeeded' });
    if (!(res.ok && res.status === 'succeeded')) throw new Error('unreachable');
    expect(res.reviewId).toBeTruthy();
    const [request] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, res.reviewId!));
    expect(request.status).toBe('pending_review');
    expect(request.mode).toBe('post-hoc');
    const rows = await auditRows(KEY);
    expect(rows.map((r) => r.status)).toEqual(['attempted', 'succeeded']);
    expect(rows[1].approvalId).toBe(res.reviewId);
  });

  it('overreach → FAILED caused by ConnectorScopeError', async () => {
    const res = await overreach({ idempotencyKey: KEY });
    expect(res).toMatchObject({ ok: false, error: 'FAILED' });
    if (!res.ok) expect(res.message).toContain('requires scope "refund"');
    const rows = await auditRows(KEY);
    expect(rows[1].error).toContain('payments.createRefund requires scope "refund"');
  });
});

describe('moduleContext', () => {
  it('redirects to /login with no session', async () => {
    signOut();
    await expect(moduleContext(manifest)).rejects.toThrow('redirect(/login)');
  });
});

describe('money', () => {
  it.each([
    ['250.01', 25001],
    ['250', 25000],
    ['1.2', 120],
    ['0.01', 1],
  ])('parses %s dollars → %i cents', (input, cents) => {
    expect(money.parse(input)).toBe(cents);
  });

  it.each(['0.00', 'abc', '1.234', '-5.00'])('rejects %s', (input) => {
    expect(() => money.parse(input)).toThrow();
  });
});
