import { z } from 'zod';
import type { RequestFn } from './http';

export const ledgerAccountSchema = z.object({
  id: z.string(),
  object: z.literal('ledger_account'),
  key: z.string(),
  name: z.string(),
  normal_balance: z.enum(['debit', 'credit']),
  currency: z.string(),
  balance: z.object({ posted: z.number() }),
});

export const ledgerEntrySchema = z.object({
  id: z.string(),
  ledger_account_id: z.string(),
  account_key: z.string(),
  direction: z.enum(['debit', 'credit']),
  amount: z.number().int(),
});

export const ledgerTransactionSchema = z.object({
  id: z.string(),
  object: z.literal('ledger_transaction'),
  external_id: z.string(),
  description: z.string(),
  effective_at: z.string(),
  status: z.string(),
  entries: z.array(ledgerEntrySchema),
  created_at: z.string(),
});

const accountListSchema = z.object({
  object: z.literal('list'),
  data: z.array(ledgerAccountSchema),
  has_more: z.boolean(),
});
const transactionListSchema = z.object({
  object: z.literal('list'),
  data: z.array(ledgerTransactionSchema),
  has_more: z.boolean(),
});

export type LedgerAccount = z.output<typeof ledgerAccountSchema>;
export type LedgerTransaction = z.output<typeof ledgerTransactionSchema>;
export type LedgerAccountKey = 'processor_receivable' | 'merchant_payables' | 'fee_revenue' | 'cash_operating';

export function createLedgerConnector(request: RequestFn) {
  let accountIds: Promise<Map<string, string>> | null = null;
  const ids = () =>
    (accountIds ??= request('GET', '/v1/accounts', { schema: accountListSchema }).then(
      ({ data }) => new Map(data.data.map((a) => [a.key, a.id])),
    ));

  return {
    read: {
      async listAccounts() {
        const { data } = await request('GET', '/v1/accounts', { schema: accountListSchema });
        return { data: data.data };
      },
      async listTransactions({ externalId, accountKey, limit }: {
        externalId?: string;
        accountKey?: LedgerAccountKey;
        limit?: number;
      } = {}) {
        let accountId: string | undefined;
        if (accountKey) {
          accountId = (await ids()).get(accountKey);
          if (!accountId) throw new Error(`unknown ledger account key ${accountKey}`);
        }
        const { data } = await request('GET', '/v1/transactions', {
          query: { external_id: externalId, ledger_account_id: accountId, limit },
          schema: transactionListSchema,
        });
        return { data: data.data, hasMore: data.has_more };
      },
    },
    post: {
      /**
       * Money-movement recipe: externalId must be the source object's id (e.g. the
       * refund id) and is also sent as the Idempotency-Key, so retries can never
       * post twice.
       */
      async postTransaction({ externalId, description, effectiveAt, entries }: {
        externalId: string;
        description: string;
        effectiveAt?: string;
        entries: { account: LedgerAccountKey; direction: 'debit' | 'credit'; amount: number }[];
      }): Promise<{ transaction: LedgerTransaction; duplicate: boolean }> {
        const byKey = await ids();
        const { status, replayed, data } = await request('POST', '/v1/transactions', {
          body: {
            external_id: externalId,
            description,
            effective_at: effectiveAt,
            entries: entries.map((e) => {
              const id = byKey.get(e.account);
              if (!id) throw new Error(`unknown ledger account key ${e.account}`);
              return { ledger_account_id: id, direction: e.direction, amount: e.amount };
            }),
          },
          idempotencyKey: externalId,
          schema: ledgerTransactionSchema,
        });
        return { transaction: data, duplicate: status === 200 || replayed };
      },
    },
  };
}

export type LedgerConnector = ReturnType<typeof createLedgerConnector>;
