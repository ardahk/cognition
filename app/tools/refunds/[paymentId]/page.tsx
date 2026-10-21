import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { moduleContext } from '@/platform/module';
import { ActionForm, DataTable, Money, PageHeader, RelativeTime, StatusBadge } from '@/platform/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import manifest from '../manifest';
import { issueRefund } from '../actions';
import { RefundFields } from '../refund-fields';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function PaymentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const ctx = await moduleContext(manifest);
  const { paymentId } = await params;
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) notFound();
  const p = await ctx.connectors.payments.getPayment(paymentId).catch((e: { status?: number }) => {
    if (e?.status === 404) notFound();
    throw e;
  });
  const [ledger, pending] = await Promise.all([
    Promise.all([p.id, ...p.refunds.map((r) => r.id)].map((externalId) => ctx.connectors.ledger.listTransactions({ externalId }))),
    ctx.pendingApprovals({ type: 'payment', id: p.id }),
  ]);
  const transactions = ledger.flatMap((l) => l.data);
  const pendingRefunds = pending.filter((a) => a.status === 'pending' && a.action === 'refund.create');
  const refundable = p.amount - p.amount_refunded;
  const canRefund = ctx.can('refunds.refund') && p.status !== 'failed' && refundable > 0;

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/tools/${manifest.id}`} className="text-sm text-muted-foreground hover:underline">
        ← Back to search
      </Link>
      <PageHeader title={p.id} description={p.description ?? undefined} actions={<StatusBadge status={p.status} />} />

      {pendingRefunds.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          <p>
            Waiting for ops lead approval in{' '}
            <Link href="/approvals" className="underline">
              Approvals
            </Link>
            :
          </p>
          <ul className="mt-1 list-disc pl-5">
            {pendingRefunds.map((a) => {
              const input = a.input as { amount: number; reason: string };
              return (
                <li key={a.id}>
                  <Money amount={input.amount} currency={p.currency} /> ({input.reason}) requested by {a.requestedByName}{' '}
                  {a.requestedAt ? <RelativeTime date={a.requestedAt} /> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Payment">
          <Field label="Amount"><Money amount={p.amount} currency={p.currency} /></Field>
          <Field label="Refunded"><Money amount={p.amount_refunded} currency={p.currency} /></Field>
          <Field label="Refundable"><Money amount={refundable} currency={p.currency} /></Field>
          <Field label="Customer">{`${p.customer.name} · ${p.customer.email}`}</Field>
          <Field label="Card">{`${p.payment_method.brand} •••• ${p.payment_method.last4}`}</Field>
          <Field label="Merchant">{p.merchant.name}</Field>
          <Field label="Created"><RelativeTime date={p.created} /></Field>
        </Section>

        {canRefund ? (
          <Section title="Issue a refund">
            <ActionForm
              key={`${p.amount_refunded}-${pendingRefunds.length}`}
              action={issueRefund}
              hidden={{ paymentId: p.id }}
              submitLabel="Issue refund"
              confirm="Issue this refund?"
              className="flex flex-col gap-3"
            >
              <RefundFields refundable={refundable} alreadyRefunded={p.amount_refunded} />
            </ActionForm>
          </Section>
        ) : null}
      </div>

      <Section title="Refunds">
        <DataTable
          rows={p.refunds}
          empty="No refunds on this payment"
          columns={[
            { header: 'Refund', cell: (r) => <span className="font-mono text-xs">{r.id}</span> },
            { header: 'Amount', cell: (r) => <Money amount={r.amount} currency={r.currency} />, className: 'text-right' },
            { header: 'Reason', cell: (r) => <span className="font-mono text-xs">{r.reason}</span> },
            { header: 'Note', cell: (r) => r.metadata?.note ?? '—' },
            { header: 'By', cell: (r) => r.metadata?.requested_by ?? '—' },
            { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
            { header: 'Created', cell: (r) => <RelativeTime date={r.created} /> },
          ]}
        />
      </Section>

      <Section title="Ledger entries">
        <DataTable
          rows={transactions.flatMap((t) => t.entries.map((e) => ({ t, e })))}
          empty="No ledger entries"
          columns={[
            { header: 'Transaction', cell: ({ t }) => <span className="font-mono text-xs">{t.id}</span> },
            { header: 'Source', cell: ({ t }) => <span className="font-mono text-xs">{t.external_id}</span> },
            { header: 'Account', cell: ({ e }) => <span className="font-mono text-xs">{e.account_key}</span> },
            {
              header: 'Debit',
              cell: ({ e }) => (e.direction === 'debit' ? <Money amount={e.amount} currency={p.currency} /> : null),
              className: 'text-right',
            },
            {
              header: 'Credit',
              cell: ({ e }) => (e.direction === 'credit' ? <Money amount={e.amount} currency={p.currency} /> : null),
              className: 'text-right',
            },
            { header: 'Effective', cell: ({ t }) => <RelativeTime date={t.effective_at} /> },
          ]}
        />
      </Section>
    </div>
  );
}
