import postgres from 'postgres';
import { z } from 'zod';
import { defineAction } from '@/platform/module';
import { manifest, overreachManifest } from './test-module';

export const echoCalls: { input: unknown; key: string }[] = [];
export const refundCalls: { input: { paymentId: string; amount: number }; key: string }[] = [];

export const echo = defineAction(manifest, {
  name: 'echo',
  permission: 'test-refunds.refund',
  input: z.object({ message: z.string().optional() }),
  handler: async ({ input, ctx }) => {
    echoCalls.push({ input, key: ctx.idempotencyKey });
    return { echoed: input };
  },
});

// Probes the write-ahead guarantee: during the handler, a separate connection must
// already see the committed `attempted` audit row.
export const probe = defineAction(manifest, {
  name: 'probe',
  permission: 'test-refunds.refund',
  input: z.object({}),
  handler: async ({ ctx }) => {
    const other = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const [{ n }] = await other`
        select count(*)::int as n from audit_events
        where status = 'attempted' and idempotency_key = ${ctx.idempotencyKey}`;
      return { attemptedRows: n };
    } finally {
      await other.end();
    }
  },
});

export const refund = defineAction(manifest, {
  name: 'refund',
  permission: 'test-refunds.refund',
  input: z.object({ paymentId: z.string(), amount: z.number().int().positive() }),
  target: (i) => ({ type: 'payment', id: i.paymentId }),
  approval: (i) =>
    i.amount > 25000 ? { permission: 'test-refunds.approve', reason: 'Refund over $250' } : null,
  handler: async ({ input, ctx }) => {
    refundCalls.push({ input, key: ctx.idempotencyKey });
    const refund = await ctx.connectors.payments.createRefund({
      paymentId: input.paymentId,
      amount: input.amount,
      reason: 'requested_by_customer',
      idempotencyKey: ctx.idempotencyKey,
    });
    ctx.record({ refundId: refund.id });
    const { transaction, duplicate } = await ctx.connectors.ledger.postTransaction({
      externalId: refund.id,
      description: `Refund ${refund.id} for ${input.paymentId}`,
      entries: [
        { account: 'merchant_payables', direction: 'debit', amount: refund.amount },
        { account: 'processor_receivable', direction: 'credit', amount: refund.amount },
      ],
    });
    ctx.record({ ledgerTransactionId: transaction.id });
    return { refundId: refund.id, ledgerTransactionId: transaction.id, duplicate };
  },
});

export const breakGlass = defineAction(manifest, {
  name: 'breakGlass',
  permission: 'test-refunds.refund',
  input: z.object({}),
  approval: () => ({ permission: 'test-refunds.approve', reason: 'Break glass', mode: 'post-hoc' }),
  handler: async () => ({ acted: true }),
});

export const fail = defineAction(manifest, {
  name: 'fail',
  permission: 'test-refunds.refund',
  input: z.object({}),
  handler: async ({ ctx }) => {
    ctx.record({ step: 'before-throw' });
    throw new Error('boom');
  },
});

export const overreach = defineAction(overreachManifest, {
  name: 'overreach',
  permission: 'test-refunds.refund',
  input: z.object({}),
  handler: async ({ ctx }) => {
    await (
      ctx.connectors.payments as unknown as {
        createRefund(a: unknown): Promise<unknown>;
      }
    ).createRefund({ paymentId: 'pay_000001', idempotencyKey: ctx.idempotencyKey });
    return { reached: true };
  },
});
