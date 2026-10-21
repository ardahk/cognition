import { and, desc, eq, sql } from 'drizzle-orm';
import { ledgerAccounts, ledgerEntries, ledgerTransactions } from './schema';
import { vendorError, type Route } from './router';

type Db = Parameters<Route['handler']>[0]['db'];

async function accountShapes(db: Db) {
  const accounts = await db.select().from(ledgerAccounts);
  const sums = await db
    .select({
      accountId: ledgerEntries.ledgerAccountId,
      direction: ledgerEntries.direction,
      total: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::bigint`,
    })
    .from(ledgerEntries)
    .groupBy(ledgerEntries.ledgerAccountId, ledgerEntries.direction);
  return accounts.map((a) => {
    const debits = Number(sums.find((s) => s.accountId === a.id && s.direction === 'debit')?.total ?? 0);
    const credits = Number(sums.find((s) => s.accountId === a.id && s.direction === 'credit')?.total ?? 0);
    return {
      id: a.id,
      object: 'ledger_account',
      key: a.key,
      name: a.name,
      normal_balance: a.normalBalance,
      currency: a.currency,
      balance: { posted: a.normalBalance === 'debit' ? debits - credits : credits - debits },
    };
  });
}

async function transactionShape(db: Db, t: typeof ledgerTransactions.$inferSelect) {
  const entries = await db
    .select({
      id: ledgerEntries.id,
      ledger_account_id: ledgerEntries.ledgerAccountId,
      account_key: ledgerAccounts.key,
      direction: ledgerEntries.direction,
      amount: ledgerEntries.amount,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerAccounts, eq(ledgerEntries.ledgerAccountId, ledgerAccounts.id))
    .where(eq(ledgerEntries.transactionId, t.id));
  return {
    id: t.id,
    object: 'ledger_transaction',
    external_id: t.externalId,
    description: t.description,
    effective_at: t.effectiveAt,
    status: t.status,
    entries: entries.sort((a, b) => a.ledger_account_id.localeCompare(b.ledger_account_id)),
    created_at: t.createdAt,
  };
}

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/v1/accounts',
    handler: async ({ db }) => ({
      body: { object: 'list', data: await accountShapes(db), has_more: false },
    }),
  },
  {
    method: 'GET',
    path: '/v1/transactions',
    handler: async ({ query, db }) => {
      const n = Number(query.get('limit') ?? 25);
      const limit = Math.max(1, Math.min(100, Number.isFinite(n) ? Math.floor(n) : 25));
      const conds = [];
      const externalId = query.get('external_id');
      if (externalId) conds.push(eq(ledgerTransactions.externalId, externalId));
      const accountId = query.get('ledger_account_id');
      if (accountId) {
        conds.push(
          sql`exists (select 1 from ${ledgerEntries} e where e.transaction_id = ${ledgerTransactions.id} and e.ledger_account_id = ${accountId})`,
        );
      }
      const rows = await db
        .select()
        .from(ledgerTransactions)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(ledgerTransactions.seq))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const data = await Promise.all(rows.slice(0, limit).map((t) => transactionShape(db, t)));
      return { body: { object: 'list', data, has_more: hasMore } };
    },
  },
  {
    method: 'POST',
    path: '/v1/transactions',
    handler: async ({ body, db }) => {
      const input = (body ?? {}) as {
        external_id?: string;
        description?: string;
        effective_at?: string;
        entries?: { ledger_account_id?: string; direction?: string; amount?: number }[];
      };
      const unprocessable = (message: string) => ({
        status: 422,
        body: vendorError('validation_error', message),
      });
      if (!input.external_id) return unprocessable('external_id is required');
      const entries = input.entries ?? [];
      if (entries.length < 2) return unprocessable('at least 2 entries are required');
      if (entries.some((e) => !Number.isInteger(e.amount) || e.amount! <= 0)) {
        return unprocessable('entry amounts must be positive integers');
      }
      const accounts = await db.select().from(ledgerAccounts);
      const accountById = new Map(accounts.map((a) => [a.id, a]));
      if (entries.some((e) => !e.ledger_account_id || !accountById.has(e.ledger_account_id))) {
        return unprocessable('unknown ledger_account_id');
      }
      if (entries.some((e) => e.direction !== 'debit' && e.direction !== 'credit')) {
        return unprocessable('direction must be debit or credit');
      }
      const norm = (es: { ledger_account_id: string; direction: string; amount: number }[]) =>
        es
          .map((e) => `${e.ledger_account_id}:${e.direction}:${e.amount}`)
          .sort()
          .join('|');
      const [existing] = await db
        .select()
        .from(ledgerTransactions)
        .where(eq(ledgerTransactions.externalId, input.external_id));
      if (existing) {
        const existingEntries = await db
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.transactionId, existing.id));
        if (
          norm(existingEntries.map((e) => ({ ledger_account_id: e.ledgerAccountId, direction: e.direction, amount: e.amount }))) ===
          norm(entries as { ledger_account_id: string; direction: string; amount: number }[])
        ) {
          return { status: 200, body: await transactionShape(db, existing) };
        }
        return {
          status: 409,
          body: vendorError(
            'external_id_conflict',
            `external_id ${input.external_id} exists with different entries`,
          ),
        };
      }
      const debits = entries
        .filter((e) => e.direction === 'debit')
        .reduce((s, e) => s + e.amount!, 0);
      const credits = entries
        .filter((e) => e.direction === 'credit')
        .reduce((s, e) => s + e.amount!, 0);
      if (debits !== credits) {
        return {
          status: 422,
          body: vendorError('unbalanced_transaction', `debits ${debits} != credits ${credits}`),
        };
      }
      const tx = await db.transaction(async (trx) => {
        const now = new Date().toISOString();
        const [t] = await trx
          .insert(ledgerTransactions)
          .values({
            id: `ltx_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`,
            externalId: input.external_id!,
            description: input.description ?? '',
            effectiveAt: input.effective_at ?? now,
            createdAt: now,
          })
          .returning();
        await trx.insert(ledgerEntries).values(
          entries.map((e) => ({
            id: `le_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`,
            transactionId: t.id,
            ledgerAccountId: e.ledger_account_id!,
            direction: e.direction as 'debit' | 'credit',
            amount: e.amount!,
          })),
        );
        return t;
      });
      return { status: 201, body: await transactionShape(db, tx) };
    },
  },
];
