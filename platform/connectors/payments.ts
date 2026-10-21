import { z } from 'zod';
import type { RequestFn } from './http';

export const refundSchema = z.object({
  id: z.string(),
  object: z.literal('refund'),
  payment: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer', 'product_not_received', 'other']),
  metadata: z.record(z.string(), z.string()).nullable(),
  created: z.number(),
});

export const paymentSchema = z.object({
  id: z.string(),
  object: z.literal('payment'),
  amount: z.number().int(),
  amount_refunded: z.number().int(),
  currency: z.string(),
  status: z.enum(['succeeded', 'partially_refunded', 'refunded', 'failed']),
  customer: z.object({ id: z.string(), email: z.string(), name: z.string() }),
  payment_method: z.object({ brand: z.string(), last4: z.string() }),
  merchant: z.object({ id: z.string(), name: z.string() }),
  description: z.string().nullable(),
  created: z.number(),
});

const paymentDetailSchema = paymentSchema.extend({ refunds: z.array(refundSchema) });
const paymentListSchema = z.object({
  object: z.literal('list'),
  data: z.array(paymentSchema),
  has_more: z.boolean(),
});
const refundListSchema = z.object({
  object: z.literal('list'),
  data: z.array(refundSchema),
  has_more: z.boolean(),
});

export type Payment = z.output<typeof paymentSchema>;
export type Refund = z.output<typeof refundSchema>;
export type PaymentDetail = z.output<typeof paymentDetailSchema>;
export type RefundReason = Refund['reason'];

export function createPaymentsConnector(request: RequestFn) {
  return {
    read: {
      async listPayments({ query, limit, startingAfter }: { query?: string; limit?: number; startingAfter?: string } = {}) {
        const { data } = await request('GET', '/v1/payments', {
          query: { query, limit, starting_after: startingAfter },
          schema: paymentListSchema,
        });
        return { data: data.data, hasMore: data.has_more };
      },
      async getPayment(id: string): Promise<PaymentDetail> {
        const { data } = await request('GET', `/v1/payments/${id}`, { schema: paymentDetailSchema });
        return data;
      },
      async listRefunds({ paymentId, createdGte, limit }: { paymentId?: string; createdGte?: Date; limit?: number } = {}) {
        const { data } = await request('GET', '/v1/refunds', {
          query: {
            payment: paymentId,
            created_gte: createdGte ? Math.floor(createdGte.getTime() / 1000) : undefined,
            limit,
          },
          schema: refundListSchema,
        });
        return { data: data.data, hasMore: data.has_more };
      },
    },
    refund: {
      async createRefund({ paymentId, amount, reason, metadata, idempotencyKey }: {
        paymentId: string;
        amount?: number;
        reason: RefundReason;
        metadata?: Record<string, string>;
        idempotencyKey: string;
      }): Promise<Refund> {
        const { data } = await request('POST', '/v1/refunds', {
          body: { payment: paymentId, amount, reason, metadata },
          idempotencyKey,
          schema: refundSchema,
        });
        return data;
      },
    },
  };
}

export type PaymentsConnector = ReturnType<typeof createPaymentsConnector>;
