import { beforeEach, describe, expect, it, vi } from 'vitest';
import { moduleContext } from '@/platform/module';
import { decideAs, inProcessFetch, signInAs, useInProcessVendors } from '@/tests/helpers';
import manifest from './manifest';
import access from './access';
import { issueRefund } from './actions';
import { maskEmail, needsApproval, startOfUtcDay, summarizeRefunds } from './rules';

type Persona = Parameters<typeof signInAs>[0];

async function as(persona: Persona) {
  signInAs(persona);
  return moduleContext(manifest);
}

type Payment = Awaited<ReturnType<Awaited<ReturnType<typeof as>>['connectors']['payments']['listPayments']>>['data'][number];

let pool: Payment[] | null = null;
const used = new Set<string>();
async function takePayment(pred: (p: Payment) => boolean) {
  if (!pool) {
    const ctx = await as('morgan');
    pool = [];
    let after: string | undefined;
    do {
      const page = await ctx.connectors.payments.listPayments({ limit: 100, startingAfter: after });
      pool.push(...page.data);
      after = page.hasMore ? page.data.at(-1)?.id : undefined;
    } while (after);
  }
  const p = pool.find((x) => !used.has(x.id) && x.status === 'succeeded' && x.amount_refunded === 0 && pred(x));
  if (!p) throw new Error('no suitable seeded payment');
  used.add(p.id);
  return p;
}

async function paymentOf(id: string) {
  return (await as('morgan')).connectors.payments.getPayment(id);
}

async function ledgerFor(externalId: string) {
  return (await (await as('morgan')).connectors.ledger.listTransactions({ externalId })).data;
}

const KEY = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = { reason: 'requested_by_customer', note: 'Customer asked' };

beforeEach(() => {
  useInProcessVendors();
});

describe('rules', () => {
  it('approval is needed once the running total on a payment passes $250', () => {
    expect(needsApproval(0, 25_000)).toBe(false);
    expect(needsApproval(0, 25_001)).toBe(true);
    expect(needsApproval(20_000, 5_000)).toBe(false);
    expect(needsApproval(20_000, 5_001)).toBe(true);
  });

  it('summarizes refunds by count, total, and reason', () => {
    expect(
      summarizeRefunds([
        { amount: 100, reason: 'duplicate' },
        { amount: 300, reason: 'other' },
        { amount: 50, reason: 'duplicate' },
      ]),
    ).toEqual({
      count: 3,
      total: 450,
      byReason: [
        { reason: 'other', amount: 300 },
        { reason: 'duplicate', amount: 150 },
      ],
    });
  });

  it('masks customer emails for display', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j•••@example.com');
    expect(maskEmail('not-an-email')).toBe('•••');
  });

  it('today starts at UTC midnight', () => {
    expect(startOfUtcDay(new Date('2026-10-21T23:59:00Z')).toISOString()).toBe('2026-10-21T00:00:00.000Z');
  });
});

describe('access', () => {
  it.each(['sam', 'jordan', 'taylor'] as const)('%s cannot open the tool (404)', async (p) => {
    await expect(as(p)).rejects.toThrow('notFound()');
  });

  it.each(['alex', 'priya', 'morgan'] as const)('%s can open the tool', async (p) => {
    await expect(as(p)).resolves.toBeTruthy();
  });

  it('compliance is view-only and only ops leads can approve', () => {
    expect(access.grants.compliance_officer).toEqual(['refunds.view']);
    const approvers = Object.entries(access.grants).filter(([, perms]) => perms?.includes('refunds.approve'));
    expect(approvers.map(([role]) => role)).toEqual(['ops_lead']);
  });

  it.each(['morgan', 'jordan', 'sam'] as const)('%s cannot issue a refund', async (persona) => {
    const p = await takePayment((x) => x.amount >= 1_000);
    signInAs(persona);
    expect(await issueRefund({ ...base, paymentId: p.id, amount: '5.00' })).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect((await paymentOf(p.id)).amount_refunded).toBe(0);
  });

  it('a reason code and a note are required', async () => {
    const p = await takePayment((x) => x.amount >= 1_000);
    signInAs('alex');
    expect(await issueRefund({ paymentId: p.id, amount: '5.00', note: 'x' })).toMatchObject({ error: 'INVALID_INPUT' });
    expect(await issueRefund({ paymentId: p.id, amount: '5.00', reason: 'because', note: 'x' })).toMatchObject({
      error: 'INVALID_INPUT',
    });
    expect(await issueRefund({ paymentId: p.id, amount: '5.00', reason: 'other', note: '  ' })).toMatchObject({
      error: 'INVALID_INPUT',
    });
    expect((await paymentOf(p.id)).amount_refunded).toBe(0);
  });
});

describe('refund', () => {
  it('a partial refund at or under $250 is issued with its ledger entries', async () => {
    const p = await takePayment((x) => x.amount >= 30_000);
    signInAs('alex');
    const res = await issueRefund({ ...base, paymentId: p.id, amount: '250.00' });
    expect(res).toMatchObject({ ok: true, status: 'succeeded' });
    const { refundId, ledgerTransactionId } = (res as { data: { refundId: string; ledgerTransactionId: string } }).data;

    const after = await paymentOf(p.id);
    expect(after).toMatchObject({ amount_refunded: 25_000, status: 'partially_refunded' });
    expect(after.refunds[0]).toMatchObject({
      id: refundId,
      amount: 25_000,
      reason: 'requested_by_customer',
      metadata: { note: 'Customer asked', requested_by: 'alex@fernpay.test' },
    });

    const [tx, ...rest] = await ledgerFor(refundId);
    expect(rest).toHaveLength(0);
    expect(tx.id).toBe(ledgerTransactionId);
    expect(tx.entries.map(({ account_key, direction, amount }) => ({ account_key, direction, amount }))).toEqual(
      expect.arrayContaining([
        { account_key: 'merchant_payables', direction: 'debit', amount: 25_000 },
        { account_key: 'processor_receivable', direction: 'credit', amount: 25_000 },
      ]),
    );
  });

  it('a full refund marks the payment refunded', async () => {
    const p = await takePayment((x) => x.amount <= 25_000);
    signInAs('alex');
    const res = await issueRefund({ ...base, paymentId: p.id, amount: (p.amount / 100).toFixed(2) });
    expect(res).toMatchObject({ ok: true, status: 'succeeded' });
    expect(await paymentOf(p.id)).toMatchObject({ amount_refunded: p.amount, status: 'refunded' });
  });

  it('cannot refund more than is refundable, and nothing posts', async () => {
    const p = await takePayment((x) => x.amount <= 20_000);
    signInAs('alex');
    const res = await issueRefund({ ...base, paymentId: p.id, amount: ((p.amount + 1) / 100).toFixed(2) });
    expect(res).toMatchObject({ ok: false, error: 'FAILED' });
    const after = await paymentOf(p.id);
    expect(after.refunds).toHaveLength(0);
  });
});

describe('retry safety', () => {
  it('a double submit with the same key refunds and posts once', async () => {
    const p = await takePayment((x) => x.amount >= 10_000);
    signInAs('alex');
    const input = { ...base, paymentId: p.id, amount: '40.00', idempotencyKey: KEY(1) };
    const first = await issueRefund(input);
    const second = await issueRefund(input);
    expect(first).toMatchObject({ ok: true, status: 'succeeded', data: { duplicate: false } });
    expect(second).toMatchObject({ ok: true, status: 'succeeded', data: { duplicate: true } });
    const id = (first as { data: { refundId: string } }).data.refundId;
    expect((second as { data: { refundId: string } }).data.refundId).toBe(id);

    const after = await paymentOf(p.id);
    expect(after.refunds).toHaveLength(1);
    expect(after.amount_refunded).toBe(4_000);
    expect(await ledgerFor(id)).toHaveLength(1);
  });

  it('a timeout on the ledger post is finished by a retry without refunding twice', async () => {
    const p = await takePayment((x) => x.amount >= 45_000);
    let dropped = false;
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const res = await inProcessFetch(input, init);
      if (!dropped && url.includes('/api/mock/ledger/') && (init?.method ?? 'GET').toUpperCase() === 'POST') {
        dropped = true;
        throw new Error('simulated network drop');
      }
      return res;
    });
    signInAs('alex');
    // The ledger posts but the response is lost. At $200, the retry would pass $250 if it counted its own refund.
    const input = { ...base, paymentId: p.id, amount: '200.00', idempotencyKey: KEY(2) };
    expect(await issueRefund(input)).toMatchObject({ ok: false, error: 'FAILED' });
    const mid = await paymentOf(p.id);
    expect(mid.refunds).toHaveLength(1);

    signInAs('alex');
    const retry = await issueRefund(input);
    expect(retry).toMatchObject({ ok: true, status: 'succeeded', data: { refundId: mid.refunds[0].id, duplicate: true } });
    const after = await paymentOf(p.id);
    expect(after.refunds).toHaveLength(1);
    expect(after.amount_refunded).toBe(20_000);
    expect(await ledgerFor(mid.refunds[0].id)).toHaveLength(1);
  });
});

describe('approval', () => {
  async function requestOver250(persona: Persona, key: number) {
    const p = await takePayment((x) => x.amount >= 40_000);
    signInAs(persona);
    const res = await issueRefund({ ...base, paymentId: p.id, amount: '300.00', approval: 'true', idempotencyKey: KEY(key) });
    expect(res).toMatchObject({ ok: true, status: 'pending_approval' });
    return { p, approvalId: (res as { approvalId: string }).approvalId };
  }

  it('over $250 waits for approval and moves no money; a double submit makes one request', async () => {
    const p = await takePayment((x) => x.amount >= 40_000);
    signInAs('alex');
    const input = { ...base, paymentId: p.id, amount: '250.01', idempotencyKey: KEY(3) };
    const first = await issueRefund(input);
    const second = await issueRefund(input);
    expect(first).toMatchObject({ ok: true, status: 'pending_approval' });
    expect(second).toEqual(first);
    expect((await paymentOf(p.id)).refunds).toHaveLength(0);
    const pending = await (await as('alex')).pendingApprovals({ type: 'payment', id: p.id });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ approverPermission: 'refunds.approve', requestedById: 'alex' });
  });

  it('an ops lead approves, then the refund and its ledger entries are issued once', async () => {
    const { p, approvalId } = await requestOver250('alex', 4);
    expect(await decideAs('priya', approvalId, 'approve')).toMatchObject({ ok: true, status: 'executed' });
    const after = await paymentOf(p.id);
    expect(after.refunds).toHaveLength(1);
    expect(after.refunds[0]).toMatchObject({ amount: 30_000, metadata: { requested_by: 'alex@fernpay.test' } });
    expect(await ledgerFor(after.refunds[0].id)).toHaveLength(1);
    expect(await decideAs('priya', approvalId, 'approve')).toMatchObject({ ok: false, error: 'NOT_PENDING' });
    expect((await paymentOf(p.id)).refunds).toHaveLength(1);
  });

  it('a rejected refund moves no money', async () => {
    const { p, approvalId } = await requestOver250('alex', 5);
    expect(await decideAs('priya', approvalId, 'reject')).toMatchObject({ ok: true, status: 'rejected' });
    expect((await paymentOf(p.id)).refunds).toHaveLength(0);
  });

  it('an ops lead cannot approve their own refund', async () => {
    const { p, approvalId } = await requestOver250('priya', 6);
    expect(await decideAs('priya', approvalId, 'approve')).toMatchObject({ ok: false, error: 'SELF_APPROVAL' });
    expect((await paymentOf(p.id)).refunds).toHaveLength(0);
  });

  it.each(['alex', 'morgan'] as const)('%s cannot approve', async (persona) => {
    const { p, approvalId } = await requestOver250('priya', persona === 'alex' ? 7 : 8);
    expect(await decideAs(persona, approvalId, 'approve')).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect((await paymentOf(p.id)).refunds).toHaveLength(0);
  });

  it('uses the running total: a small refund that takes the payment past $250 needs approval', async () => {
    const p = await takePayment((x) => x.amount >= 40_000);
    signInAs('alex');
    expect(await issueRefund({ ...base, paymentId: p.id, amount: '200.00' })).toMatchObject({ status: 'succeeded' });

    // A stale page that didn't flag approval is caught by the server.
    expect(await issueRefund({ ...base, paymentId: p.id, amount: '60.00', approval: 'false' })).toMatchObject({
      ok: false,
      error: 'FAILED',
    });
    expect((await paymentOf(p.id)).refunds).toHaveLength(1);

    signInAs('alex');
    const res = await issueRefund({ ...base, paymentId: p.id, amount: '60.00', approval: 'true' });
    expect(res).toMatchObject({ ok: true, status: 'pending_approval' });
    expect(await decideAs('priya', (res as { approvalId: string }).approvalId, 'approve')).toMatchObject({
      status: 'executed',
    });
    expect(await paymentOf(p.id)).toMatchObject({ amount_refunded: 26_000 });
  });

  it('a refund that keeps the running total at $250 needs no approval', async () => {
    const p = await takePayment((x) => x.amount >= 40_000);
    signInAs('alex');
    expect(await issueRefund({ ...base, paymentId: p.id, amount: '200.00' })).toMatchObject({ status: 'succeeded' });
    expect(await issueRefund({ ...base, paymentId: p.id, amount: '50.00' })).toMatchObject({ status: 'succeeded' });
  });
});
