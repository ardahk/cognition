import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/platform/auth/session';
import { listApprovals } from '@/platform/approvals/store';
import { decide } from '@/platform/approvals/actions';
import { modules } from '@/platform/registry.generated';
import { ActionForm, PageHeader, RelativeTime, StatusBadge } from '@/platform/ui';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'needs-approval', label: 'Needs approval' },
  { id: 'needs-review', label: 'Needs review' },
  { id: 'mine', label: 'Mine' },
] as const;

function summary(input: unknown) {
  const s = JSON.stringify(input);
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { tab = 'needs-approval' } = await searchParams;

  const rows =
    tab === 'needs-review'
      ? await listApprovals.needsReview(session)
      : tab === 'mine'
        ? await listApprovals.myRequests(session.user.id)
        : await listApprovals.needsMyApproval(session);
  const toolName = (id: string) =>
    modules.find((m) => m.manifest.id === id)?.manifest.name ?? id;
  const actionable = tab !== 'mine';

  return (
    <div>
      <PageHeader title="Approvals" />
      <div className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/approvals?tab=${t.id}`}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === t.id
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{toolName(r.module)}</span>
                <span className="font-mono text-xs text-muted-foreground">{r.action}</span>
                <StatusBadge status={r.status} />
                <span className="ml-auto text-xs text-muted-foreground">
                  <RelativeTime date={r.requestedAt ?? new Date()} />
                </span>
              </div>
              <p className="mt-1 text-sm">{r.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                by {r.requestedByName} ({r.requestedByEmail})
                {r.targetType ? ` · ${r.targetType}:${r.targetId}` : ''}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{summary(r.input)}</p>
              {tab === 'mine' ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  {r.error ? <span className="text-destructive">{r.error}</span> : null}
                  {r.result ? (
                    <span className="font-mono">{JSON.stringify(r.result).slice(0, 200)}</span>
                  ) : null}
                  {r.decisionNote ? <span> · note: {r.decisionNote}</span> : null}
                </div>
              ) : null}
              {actionable ? (
                <ActionForm
                  action={decide}
                  hidden={{ id: r.id }}
                  className="mt-3 flex items-start gap-2"
                >
                  <Textarea
                    name="note"
                    placeholder="Note (optional)"
                    className="min-h-8 flex-1"
                    rows={1}
                  />
                  <Button type="submit" name="decision" value="approve">
                    Approve
                  </Button>
                  <Button type="submit" name="decision" value="reject" variant="outline">
                    Reject
                  </Button>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
