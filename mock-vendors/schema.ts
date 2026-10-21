import { integer, jsonb, pgSchema, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

const seq = () => integer().generatedAlwaysAsIdentity();

export const vendorSim = pgSchema('vendor_sim');

export const payments = vendorSim.table('payments', {
  seq: seq(),
  id: text('id').primaryKey(),
  amount: integer('amount').notNull(),
  amountRefunded: integer('amount_refunded').notNull().default(0),
  currency: text('currency').notNull().default('usd'),
  status: text('status', {
    enum: ['succeeded', 'partially_refunded', 'refunded', 'failed'],
  }).notNull(),
  customer: jsonb('customer').notNull().$type<{ id: string; email: string; name: string }>(),
  paymentMethod: jsonb('payment_method').notNull().$type<{ brand: string; last4: string }>(),
  merchant: jsonb('merchant').notNull().$type<{ id: string; name: string }>(),
  description: text('description'),
  created: integer('created').notNull(),
});

export const refunds = vendorSim.table('refunds', {
  seq: seq(),
  id: text('id').primaryKey(),
  paymentId: text('payment_id').notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('usd'),
  status: text('status').notNull().default('succeeded'),
  reason: text('reason', {
    enum: ['duplicate', 'fraudulent', 'requested_by_customer', 'product_not_received', 'other'],
  }).notNull(),
  metadata: jsonb('metadata'),
  created: integer('created').notNull(),
});

export const kycCases = vendorSim.table('kyc_cases', {
  seq: seq(),
  id: text('id').primaryKey(),
  status: text('status', {
    enum: ['pending_review', 'approved', 'declined', 'needs_info', 'escalated'],
  }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  slaDueAt: text('sla_due_at').notNull(),
  applicant: jsonb('applicant')
    .notNull()
    .$type<{
      first_name: string;
      last_name: string;
      dob: string;
      ssn_last4: string | null;
      email: string;
      phone: string;
      nationality: string;
      address: { line1: string; city: string; region: string; postal_code: string; country: string };
    }>(),
  document: jsonb('document')
    .notNull()
    .$type<{
      type: 'passport' | 'drivers_license' | 'national_id';
      number: string;
      issuing_country: string;
      status: 'passed' | 'failed' | 'needs_review';
    }>(),
  selfie: jsonb('selfie').notNull().$type<{ status: string; match_score: number }>(),
  watchlist: jsonb('watchlist')
    .notNull()
    .$type<{
      status: 'clear' | 'hit';
      hits: { list: 'OFAC SDN' | 'PEP' | 'Adverse Media'; matched_name: string; score: number }[];
    }>(),
  device: jsonb('device')
    .notNull()
    .$type<{ ip_country: string; vpn: boolean; risk: 'low' | 'medium' | 'high' }>(),
  riskScore: integer('risk_score').notNull(),
  riskLevel: text('risk_level', { enum: ['low', 'medium', 'high'] }).notNull(),
  assignee: text('assignee'),
  decision: jsonb('decision').$type<{
    outcome: string;
    reason_code: string | null;
    note: string | null;
    decided_by: string;
    decided_at: string;
  } | null>(),
});

export const kycNotes = vendorSim.table('kyc_notes', {
  seq: seq(),
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull(),
  author: text('author').notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
});

export const ledgerAccounts = vendorSim.table('ledger_accounts', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  normalBalance: text('normal_balance', { enum: ['debit', 'credit'] }).notNull(),
  currency: text('currency').notNull().default('usd'),
});

export const ledgerTransactions = vendorSim.table('ledger_transactions', {
  seq: seq(),
  id: text('id').primaryKey(),
  externalId: text('external_id').notNull().unique(),
  description: text('description').notNull(),
  effectiveAt: text('effective_at').notNull(),
  status: text('status').notNull().default('posted'),
  createdAt: text('created_at').notNull(),
});

export const ledgerEntries = vendorSim.table('ledger_entries', {
  seq: seq(),
  id: text('id').primaryKey(),
  transactionId: text('transaction_id').notNull(),
  ledgerAccountId: text('ledger_account_id').notNull(),
  direction: text('direction', { enum: ['debit', 'credit'] }).notNull(),
  amount: integer('amount').notNull(),
});

export const flags = vendorSim.table('flags', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  owner: text('owner').notNull(),
  tags: text('tags').array().notNull().default([]),
  environments: jsonb('environments')
    .notNull()
    .$type<Record<'development' | 'staging' | 'production', { enabled: boolean; rollout_percentage: number }>>(),
  version: integer('version').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export const idempotencyKeys = vendorSim.table('idempotency_keys', {
  vendor: text('vendor').notNull(),
  key: text('key').notNull(),
  requestHash: text('request_hash').notNull(),
  status: integer('status'),
  response: jsonb('response'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.vendor, t.key] })]);
