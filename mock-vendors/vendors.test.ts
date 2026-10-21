import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/platform/db/client';
import { kycCases, ledgerAccounts, ledgerTransactions, payments, refunds } from './schema';
import { createHttpClient, type RequestFn } from '@/platform/connectors/http';
import { createKycConnector } from '@/platform/connectors/kyc';
import { createLedgerConnector } from '@/platform/connectors/ledger';
import { createFlagsConnector } from '@/platform/connectors/flags';
import { inProcessFetch, useInProcessVendors } from '@/tests/helpers';

const BASE = 'http://vendors.test/api/mock';
const KEY = process.env.PAYMENTS_API_KEY!;

const req = (path: string, init?: RequestInit) => inProcessFetch(`${BASE}${path}`, init);
const authed = (key = KEY, init?: RequestInit) => ({
  ...init,
  headers: { authorization: `Bearer ${key}`, ...(init?.headers ?? {}) },
});

function connector<C>(vendor: string, make: (r: RequestFn) => C): C {
  const apiKey = process.env[`${vendor.toUpperCase()}_API_KEY`]!;
  return make(createHttpClient(vendor, { baseUrl: `${BASE}/${vendor}`, apiKey }));
}

const kycConn = () => connector('kyc', createKycConnector);
const ledgerConn = () => connector('ledger', createLedgerConnector);
const flagsConn = () => connector('flags', createFlagsConnector);

beforeEach(useInProcessVendors);

describe('mock vendors', () => {
  it('rejects missing or wrong API keys with 401', async () => {
    expect((await req('/payments/v1/payments')).status).toBe(401);
    expect((await req('/payments/v1/payments', authed('sk_wrong'))).status).toBe(401);
    const res = await req('/payments/v1/payments?limit=2', authed());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('list');
    expect(body.data).toHaveLength(2);
    expect(body.data[0].object).toBe('payment');
  });

  it('replays an identical POST under the same Idempotency-Key', async () => {
    const [p] = await db.select().from(payments).where(eq(payments.status, 'succeeded')).limit(1);
    const key = crypto.randomUUID();
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({ payment: p.id, amount: 100, reason: 'duplicate' }),
    };
    const r1 = await req('/payments/v1/refunds', authed(KEY, init));
    const r2 = await req('/payments/v1/refunds', authed(KEY, init));
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect((await r1.json()).id).toBe((await r2.json()).id);
    expect(r2.headers.get('idempotent-replayed')).toBe('true');
  });

  it('409 on same key + different body; 400 when key missing', async () => {
    const [p] = await db.select().from(payments).where(eq(payments.status, 'succeeded')).limit(1);
    const key = crypto.randomUUID();
    const post = (amount: number, headers = {} as Record<string, string>) =>
      req('/payments/v1/refunds', {
        method: 'POST',
        headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ payment: p.id, amount, reason: 'duplicate' }),
      });
    await post(100, { 'idempotency-key': key });
    const conflict = await post(200, { 'idempotency-key': key });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.type).toBe('idempotency_key_reused');
    const missing = await post(300);
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.type).toBe('idempotency_key_required');
  });

  it('422 when refund exceeds refundable, and on failed payments', async () => {
    const ok = await db
      .select()
      .from(payments)
      .where(eq(payments.status, 'succeeded'))
      .limit(50);
    const p = ok.find((r) => r.amountRefunded === 0)!;
    const over = await req('/payments/v1/refunds', authed(KEY, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ payment: p.id, amount: p.amount + 1, reason: 'other' }),
    }));
    expect(over.status).toBe(422);
    const [failed] = await db.select().from(payments).where(eq(payments.status, 'failed')).limit(1);
    const onFailed = await req('/payments/v1/refunds', authed(KEY, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ payment: failed.id, reason: 'other' }),
    }));
    expect(onFailed.status).toBe(422);
  });

  it('two concurrent full-amount refunds with different keys → exactly one succeeds', async () => {
    const ok = await db
      .select()
      .from(payments)
      .where(eq(payments.status, 'succeeded'))
      .limit(50);
    const p = ok.find((r) => r.amountRefunded === 0)!;
    const post = () =>
      req('/payments/v1/refunds', authed(KEY, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ payment: p.id, amount: p.amount, reason: 'other' }),
      }));
    const [r1, r2] = await Promise.all([post(), post()]);
    expect([r1.status, r2.status].sort()).toEqual([201, 422]);

    const created = await db.select().from(refunds).where(eq(refunds.paymentId, p.id));
    expect(created).toHaveLength(1);
    const [updated] = await db.select().from(payments).where(eq(payments.id, p.id));
    expect(updated.amountRefunded).toBe(created.reduce((s, r) => s + r.amount, 0));
  });
});

describe('ledger', () => {
  const accountId = async (key: string) =>
    (await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.key, key)))[0].id;
  const posted = async (key: string) => {
    const { data } = await ledgerConn().read.listAccounts();
    return data.find((a) => a.key === key)!.balance.posted;
  };
  const balancedEntries = async (amount: number) => [
    { account: 'processor_receivable' as const, direction: 'debit' as const, amount },
    { account: 'merchant_payables' as const, direction: 'credit' as const, amount },
  ];
  const rawEntries = async (amount: number) => [
    { ledger_account_id: await accountId('processor_receivable'), direction: 'debit', amount },
    { ledger_account_id: await accountId('merchant_payables'), direction: 'credit', amount },
  ];

  it('rejects an unbalanced transaction with 422', async () => {
    const [receivable, payables] = [await accountId('processor_receivable'), await accountId('merchant_payables')];
    const res = await req('/ledger/v1/transactions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.LEDGER_API_KEY}`,
        'content-type': 'application/json',
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        external_id: `test_unbalanced_${crypto.randomUUID()}`,
        description: 'unbalanced',
        entries: [
          { ledger_account_id: receivable, direction: 'debit', amount: 100 },
          { ledger_account_id: payables, direction: 'credit', amount: 99 },
        ],
      }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error.type).toBe('unbalanced_transaction');
  });

  it('posts a balanced transaction and moves the balances', async () => {
    const before = { recv: await posted('processor_receivable'), pay: await posted('merchant_payables') };
    const { transaction, duplicate } = await ledgerConn().post.postTransaction({
      externalId: `test_balanced_${crypto.randomUUID()}`,
      description: 'balanced test',
      entries: await balancedEntries(10_000),
    });
    expect(duplicate).toBe(false);
    expect(await posted('processor_receivable')).toBe(before.recv + 10_000);
    expect(await posted('merchant_payables')).toBe(before.pay + 10_000);
    expect(transaction.entries).toHaveLength(2);
  });

  it('dedupes external_id: same entries + different key → 200; different entries → 409', async () => {
    const ledger = ledgerConn();
    const externalId = `test_dedupe_${crypto.randomUUID()}`;
    const entries = await balancedEntries(700);
    const first = await ledger.post.postTransaction({ externalId, description: 't', entries });
    expect(first.duplicate).toBe(false);

    // same external_id + same normalized entries + a different Idempotency-Key → 200
    const dup = await req('/ledger/v1/transactions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.LEDGER_API_KEY}`,
        'content-type': 'application/json',
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        external_id: externalId,
        description: 't',
        entries: await rawEntries(700),
      }),
    });
    expect(dup.status).toBe(200);
    expect((await dup.json()).id).toBe(first.transaction.id);
    const count = await db
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.externalId, externalId));
    expect(count).toHaveLength(1);

    // same external_id + different entries → 409
    const other = await req('/ledger/v1/transactions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.LEDGER_API_KEY}`,
        'content-type': 'application/json',
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        external_id: externalId,
        description: 'conflict',
        entries: await rawEntries(701),
      }),
    });
    expect(other.status).toBe(409);
    expect((await other.json()).error.type).toBe('external_id_conflict');
  });
});

describe('kyc', () => {
  it('masks all 7 PII fields and reveals them via getPii', async () => {
    const [row] = await db
      .select()
      .from(kycCases)
      .where(eq(kycCases.riskLevel, 'high'))
      .limit(1);
    const kyc = kycConn();
    const c = await kyc.read.getCase(row.id);
    expect(c.pii_masked).toBe(true);
    expect(c.applicant.dob).toBe('••••-••-••');
    if (c.applicant.ssn_last4 !== null) expect(c.applicant.ssn_last4).toBe('••••');
    expect(c.document.number.endsWith(row.document.number.slice(-2))).toBe(true);
    expect(c.document.number.startsWith('•')).toBe(true);
    expect(c.applicant.address.line1).toBe('••••••');
    expect(c.applicant.address.postal_code).toBe('•••••');
    expect(c.applicant.email).toBe(
      `${row.applicant.email[0]}•••@${row.applicant.email.split('@')[1]}`,
    );
    expect(c.applicant.phone).toBe(`•••-•••-${row.applicant.phone.slice(-4)}`);

    for (const field of [
      'dob', 'ssn_last4', 'document_number', 'address_line1', 'postal_code', 'email', 'phone',
    ] as const) {
      const raw = await kyc.pii.getPii(row.id, field);
      const expected = {
        dob: row.applicant.dob,
        ssn_last4: row.applicant.ssn_last4,
        document_number: row.document.number,
        address_line1: row.applicant.address.line1,
        postal_code: row.applicant.address.postal_code,
        email: row.applicant.email,
        phone: row.applicant.phone,
      }[field];
      expect(raw).toBe(expected);
    }
  });
});

describe('flags', () => {
  it('setEnvironment updates state and bumps version; 101 → 422', async () => {
    const flags = flagsConn();
    const { data } = await flags.read.listFlags();
    const key = data[0].key;
    const before = await flags.read.getFlag(key);
    const updated = await flags.write.setEnvironment(key, 'production', {
      enabled: true,
      rolloutPercentage: 25,
      actor: 'taylor@fernpay.test',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(updated.environments.production).toEqual({ enabled: true, rollout_percentage: 25 });
    expect(updated.version).toBe(before.version + 1);
    expect(updated.updated_by).toBe('taylor@fernpay.test');

    await expect(
      flags.write.setEnvironment(key, 'staging', {
        rolloutPercentage: 101,
        actor: 'taylor@fernpay.test',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 422, type: 'validation_error' });
  });
});
