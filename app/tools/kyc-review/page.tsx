import { moduleContext } from '@/platform/module';
import { CursorPager, DataTable, PageHeader, StatusBadge } from '@/platform/ui';
import { Button } from '@/components/ui/button';
import manifest from './manifest';
import { RISK_LEVELS, STATUSES } from './rules';
import { Risk } from './risk';
import { Sla } from './sla';

const LIMIT = 100;
const selectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

type Search = { status?: string; risk?: string; mine?: string; after?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await moduleContext(manifest);
  const sp = await searchParams;
  const statusParam = sp.status === 'all' ? 'all' : (STATUSES.find((s) => s === sp.status) ?? 'pending_review');
  const status = statusParam === 'all' ? undefined : statusParam;
  const risk = RISK_LEVELS.find((r) => r === sp.risk);
  const mine = sp.mine === '1';

  const { data: cases, hasMore } = await ctx.connectors.kyc.listCases({
    status,
    risk,
    assignee: mine ? ctx.user.email : undefined,
    limit: LIMIT,
    startingAfter: sp.after,
  });

  return (
    <div>
      <PageHeader title={manifest.name} description="KYC cases waiting for review, oldest first." />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Status
          <select name="status" defaultValue={statusParam} className={selectClass}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="all">all</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Risk
          <select name="risk" defaultValue={risk ?? ''} className={selectClass}>
            <option value="">any</option>
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-8 items-center gap-2">
          <input type="checkbox" name="mine" value="1" defaultChecked={mine} />
          Assigned to me
        </label>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>
      <DataTable
        rows={cases}
        rowHref={(c) => `/tools/${manifest.id}/${c.id}`}
        empty="No cases match these filters"
        columns={[
          { header: 'Case', cell: (c) => <span className="font-mono text-xs">{c.id}</span> },
          { header: 'Applicant', cell: (c) => `${c.applicant.first_name} ${c.applicant.last_name}` },
          { header: 'Country', cell: (c) => c.applicant.address.country },
          { header: 'Risk', cell: (c) => <Risk score={c.risk_score} level={c.risk_level} /> },
          { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
          { header: 'Assignee', cell: (c) => c.assignee ?? <span className="text-muted-foreground">Unassigned</span> },
          { header: 'SLA (24h)', cell: (c) => <Sla dueAt={c.sla_due_at} status={c.status} /> },
        ]}
      />
      <CursorPager nextCursor={hasMore ? cases.at(-1)?.id : undefined} />
    </div>
  );
}
