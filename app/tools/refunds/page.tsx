import { moduleContext } from '@/platform/module';
import { CursorPager, DataTable, Money, PageHeader, RelativeTime, SearchForm, StatusBadge } from '@/platform/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import manifest from './manifest';
import { startOfUtcDay, summarizeRefunds } from './rules';

const LIMIT = 25;

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; after?: string }> }) {
  const ctx = await moduleContext(manifest);
  const sp = await searchParams;
  const query = sp.q?.trim() || undefined;

  const [today, pending, payments] = await Promise.all([
    ctx.connectors.payments.listRefunds({ createdGte: startOfUtcDay(), limit: 100 }),
    ctx.pendingApprovals(),
    ctx.connectors.payments.listPayments({ query, limit: LIMIT, startingAfter: sp.after }),
  ]);
  const summary = summarizeRefunds(today.data);
  const waiting = pending.filter((p) => p.status === 'pending' && p.action === 'refund.create').length;
  const more = today.hasMore ? '+' : '';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={manifest.name} description="Find a payment by payment ID, customer email, or card last 4." />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Refunds issued today (UTC)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {summary.count}
              {more}
            </p>
            <p className="text-sm text-muted-foreground">
              <Money amount={summary.total} />
              {more} refunded
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Waiting for approval</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{waiting}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Refunded today by reason</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.byReason.length === 0 ? <p className="text-sm text-muted-foreground">No refunds yet today.</p> : null}
            <ul className="flex flex-col gap-1 text-sm">
              {summary.byReason.map((r) => (
                <li key={r.reason} className="flex justify-between gap-2">
                  <span className="font-mono text-xs">{r.reason}</span>
                  <Money amount={r.amount} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      {today.hasMore ? (
        <p className="text-xs text-muted-foreground">More than 100 refunds today; totals show the most recent 100.</p>
      ) : null}

      <div className="flex flex-col gap-3">
        <SearchForm placeholder="pay_…, email, or last 4" />
        <DataTable
          rows={payments.data}
          rowHref={(p) => `/tools/${manifest.id}/${p.id}`}
          empty={query ? 'No payments match this search' : 'No payments'}
          columns={[
            { header: 'Payment', cell: (p) => <span className="font-mono text-xs">{p.id}</span> },
            { header: 'Customer', cell: (p) => p.customer.email },
            { header: 'Card', cell: (p) => `${p.payment_method.brand} •••• ${p.payment_method.last4}` },
            { header: 'Amount', cell: (p) => <Money amount={p.amount} currency={p.currency} />, className: 'text-right' },
            { header: 'Refunded', cell: (p) => <Money amount={p.amount_refunded} currency={p.currency} />, className: 'text-right' },
            { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
            { header: 'Created', cell: (p) => <RelativeTime date={new Date(p.created * 1000)} /> },
          ]}
        />
        <CursorPager nextCursor={payments.hasMore ? payments.data.at(-1)?.id : undefined} />
      </div>
    </div>
  );
}
