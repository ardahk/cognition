import { and, desc, eq, ilike, lt, or, sql } from 'drizzle-orm';
import { payments, refunds } from './schema';
import { vendorError, type Route } from './router';

function limitOf(query: URLSearchParams) {
  const n = Number(query.get('limit') ?? 25);
  return Math.max(1, Math.min(100, Number.isFinite(n) ? Math.floor(n) : 25));
}

function refundShape(r: typeof refunds.$inferSelect) {
  return {
    id: r.id,
    object: 'refund',
    payment: r.paymentId,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    reason: r.reason,
    metadata: r.metadata,
    created: r.created,
  };
}

function paymentShape(p: typeof payments.$inferSelect) {
  return {
    id: p.id,
    object: 'payment',
    amount: p.amount,
    amount_refunded: p.amountRefunded,
    currency: p.currency,
    status: p.status,
    customer: p.customer,
    payment_method: p.paymentMethod,
    merchant: p.merchant,
    description: p.description,
    created: p.created,
  };
}

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/v1/payments',
    handler: async ({ query, db }) => {
      const limit = limitOf(query);
      const conds = [];
      const q = query.get('query');
      if (q) {
        conds.push(
          or(
            eq(payments.id, q),
            ilike(sql`${payments.customer} ->> 'email'`, `%${q}%`),
            eq(sql`${payments.paymentMethod} ->> 'last4'`, q),
          ),
        );
      }
      const after = query.get('starting_after');
      if (after) {
        const [c] = await db.select().from(payments).where(eq(payments.id, after));
        if (!c) return { status: 404, body: vendorError('not_found', `No such payment ${after}`) };
        conds.push(
          or(
            lt(payments.created, c.created),
            and(eq(payments.created, c.created), lt(payments.seq, c.seq)),
          ),
        );
      }
      const rows = await db
        .select()
        .from(payments)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(payments.created), desc(payments.seq))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      return {
        body: { object: 'list', data: rows.slice(0, limit).map(paymentShape), has_more: hasMore },
      };
    },
  },
  {
    method: 'GET',
    path: '/v1/payments/:id',
    handler: async ({ params, db }) => {
      const [p] = await db.select().from(payments).where(eq(payments.id, params.id));
      if (!p) return { status: 404, body: vendorError('not_found', `No such payment ${params.id}`) };
      const rs = await db
        .select()
        .from(refunds)
        .where(eq(refunds.paymentId, p.id))
        .orderBy(desc(refunds.seq));
      return { body: { ...paymentShape(p), refunds: rs.map(refundShape) } };
    },
  },
  {
    method: 'POST',
    path: '/v1/refunds',
    handler: async ({ body, db }) => {
      const input = (body ?? {}) as {
        payment?: string;
        amount?: number;
        reason?: string;
        metadata?: Record<string, string>;
      };
      if (!input.payment) {
        return { status: 422, body: vendorError('validation_error', 'payment is required') };
      }
      const [p] = await db.select().from(payments).where(eq(payments.id, input.payment));
      if (!p) {
        return { status: 404, body: vendorError('not_found', `No such payment ${input.payment}`) };
      }
      if (p.status === 'failed') {
        return {
          status: 422,
          body: vendorError('validation_error', 'Cannot refund a failed payment'),
        };
      }
      const refundable = p.amount - p.amountRefunded;
      const amount = input.amount ?? refundable;
      if (!Number.isInteger(amount) || amount <= 0 || amount > refundable) {
        return {
          status: 422,
          body: vendorError('validation_error', `amount must be between 1 and ${refundable}`),
        };
      }
      const reasons = ['duplicate', 'fraudulent', 'requested_by_customer', 'product_not_received', 'other'] as const;
      const reason = input.reason ?? 'requested_by_customer';
      if (!reasons.includes(reason as (typeof reasons)[number])) {
        return { status: 422, body: vendorError('validation_error', `Invalid reason ${reason}`) };
      }
      const refund = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(payments)
          .set({
            amountRefunded: sql`${payments.amountRefunded} + ${amount}`,
            status: sql`CASE WHEN ${payments.amountRefunded} + ${amount} >= ${payments.amount} THEN 'refunded' ELSE 'partially_refunded' END`,
          })
          .where(
            and(
              eq(payments.id, p.id),
              sql`${payments.status} <> 'failed'`,
              sql`${payments.amountRefunded} + ${amount} <= ${payments.amount}`,
            ),
          )
          .returning();
        if (!updated) return null;
        const [r] = await tx
          .insert(refunds)
          .values({
            id: `re_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`,
            paymentId: p.id,
            amount,
            reason: reason as (typeof reasons)[number],
            metadata: input.metadata ?? {},
            created: Math.floor(Date.now() / 1000),
          })
          .returning();
        return r;
      });
      if (!refund) {
        return {
          status: 422,
          body: vendorError('validation_error', `amount must be between 1 and ${refundable}`),
        };
      }
      return { status: 201, body: refundShape(refund) };
    },
  },
  {
    method: 'GET',
    path: '/v1/refunds',
    handler: async ({ query, db }) => {
      const limit = limitOf(query);
      const conds = [];
      const payment = query.get('payment');
      if (payment) conds.push(eq(refunds.paymentId, payment));
      const createdGte = query.get('created_gte');
      if (createdGte) conds.push(sql`${refunds.created} >= ${Number(createdGte)}`);
      const rows = await db
        .select()
        .from(refunds)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(refunds.seq))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      return {
        body: { object: 'list', data: rows.slice(0, limit).map(refundShape), has_more: hasMore },
      };
    },
  },
];
