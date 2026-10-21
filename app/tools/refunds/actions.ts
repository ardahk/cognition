'use server';

import { z } from 'zod';
import { defineAction, money } from '@/platform/module';
import manifest from './manifest';
import { APPROVAL_THRESHOLD, NOTE_MAX, REFUND_REASONS, needsApproval } from './rules';

export const issueRefund = defineAction(manifest, {
  name: 'refund.create',
  permission: 'refunds.refund',
  // `approval` is the page's hint that the running total on the payment would pass
  // $250; the handler re-checks the live payment so a stale hint can never skip it.
  input: z.object({
    paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
    amount: money,
    reason: z.enum(REFUND_REASONS),
    note: z.string().trim().min(1).max(NOTE_MAX),
    approval: z.stringbool().default(false),
  }),
  target: (i) => ({ type: 'payment', id: i.paymentId }),
  approval: (i) =>
    i.approval || i.amount > APPROVAL_THRESHOLD
      ? { permission: 'refunds.approve', reason: 'Refunds on this payment would total over $250' }
      : null,
  handler: async ({ input, ctx }) => {
    if (!ctx.approvedBy) {
      const payment = await ctx.connectors.payments.getPayment(input.paymentId);
      const isRetry = payment.refunds.some((r) => r.metadata?.idempotency_key === ctx.idempotencyKey);
      if (!isRetry && needsApproval(payment.amount_refunded, input.amount)) {
        throw new Error('Refunds on this payment would now total over $250. Reload the page and request approval.');
      }
    } else {
      ctx.record({ approvedBy: ctx.approvedBy.email });
    }
    const refund = await ctx.connectors.payments.createRefund({
      paymentId: input.paymentId,
      amount: input.amount,
      reason: input.reason,
      metadata: { note: input.note, requested_by: ctx.user.email, idempotency_key: ctx.idempotencyKey },
      idempotencyKey: ctx.idempotencyKey,
    });
    ctx.record({ refundId: refund.id, amount: refund.amount });
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
