import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/platform/auth/session';
import { listAudit } from '@/platform/audit';
import { modules } from '@/platform/registry.generated';
import { DataTable, PageHeader, RelativeTime, StatusBadge } from '@/platform/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STATUSES = [
  'denied',
  'pending_approval',
  'approved',
  'rejected',
  'attempted',
  'succeeded',
  'failed',
  'reviewed',
];

const inputClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

function short(v: string | null | undefined) {
  return v ? v.slice(0, 8) : '—';
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <pre className="max-w-xl overflow-x-auto whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.permissions.has('platform.audit.view')) notFound();
  const sp = await searchParams;
  const tool = typeof sp.tool === 'string' && sp.tool ? sp.tool : undefined;
  const status = typeof sp.status === 'string' && sp.status ? sp.status : undefined;
  const actor = typeof sp.actor === 'string' && sp.actor ? sp.actor : undefined;
  const unresolved = sp.unresolved === 'on';

  const rows = await listAudit({ module: tool, actor, status, unresolved, limit: 200 });

  return (
    <div>
      <PageHeader title="Audit log" description="Every action, before and after." />
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="tool">Tool</Label>
          <select id="tool" name="tool" defaultValue={tool ?? ''} className={inputClass}>
            <option value="">All</option>
            {modules.map((m) => (
              <option key={m.manifest.id} value={m.manifest.id}>
                {m.manifest.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={status ?? ''} className={inputClass}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="actor">Actor</Label>
          <Input
            id="actor"
            name="actor"
            defaultValue={actor ?? ''}
            placeholder="email"
            className="h-8 w-56"
          />
        </div>
        <label className="flex items-center gap-2 pb-1 text-sm">
          <input type="checkbox" name="unresolved" defaultChecked={unresolved} />
          Unresolved only
        </label>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
      </form>
      <DataTable
        rows={rows}
        empty="No audit events"
        columns={[
          { header: 'Time', cell: (r) => <RelativeTime date={r.at} /> },
          {
            header: 'Actor',
            cell: (r) => (
              <div className="text-xs">
                <div>
                  {r.actorName} <span className="text-muted-foreground">{r.actorEmail}</span>
                </div>
                <div className="flex gap-1">
                  {r.actorRoles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
            ),
          },
          { header: 'Action', cell: (r) => <span className="font-mono text-xs">{r.action}</span> },
          { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
          {
            header: 'Target',
            cell: (r) =>
              r.targetType ? (
                <span className="font-mono text-xs">
                  {r.targetType}:{r.targetId}
                </span>
              ) : (
                '—'
              ),
          },
          { header: 'Attempt', cell: (r) => <span className="font-mono text-xs">{short(r.attemptId)}</span> },
          { header: 'Key', cell: (r) => <span className="font-mono text-xs">{short(r.idempotencyKey)}</span> },
          {
            header: 'Approval',
            cell: (r) => (
              <span className="font-mono text-xs">
                {short(r.approvalId)}
                {r.approvedBy ? ` / ${r.approvedBy}` : ''}
              </span>
            ),
          },
          {
            header: '',
            cell: (r) => (
              <details className="text-xs">
                <summary className="cursor-pointer text-primary">JSON</summary>
                <div className="mt-1 flex flex-col gap-1 font-mono">
                  <Json label="input" value={r.input} />
                  <Json label="result" value={r.result} />
                  <Json label="error" value={r.error} />
                </div>
              </details>
            ),
          },
        ]}
      />
    </div>
  );
}
