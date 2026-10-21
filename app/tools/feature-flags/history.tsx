import { RelativeTime, StatusBadge } from '@/platform/ui';
import { onOff } from './rules';

type AuditRow = {
  id: number;
  at: Date;
  action: string;
  status: string;
  actorName: string | null;
  actorEmail: string;
  approvalId: string | null;
  approvedBy: string | null;
  input: unknown;
  error: string | null;
};

type Input = {
  env?: string;
  enabled?: boolean;
  rollout?: number;
  fromEnabled?: boolean;
  fromRollout?: number;
  reason?: string;
};

const ACTION_LABELS: Record<string, string> = {
  'feature-flags.flag.set': 'Change',
  'feature-flags.flag.kill': 'Kill switch',
};

function describe(input: Input | undefined) {
  if (!input) return null;
  if (input.reason !== undefined) return `production → off. Reason: ${input.reason}`;
  if (input.env) {
    const from = input.fromEnabled === undefined ? '' : `${onOff(input.fromEnabled, input.fromRollout)} → `;
    return `${input.env}: ${from}${onOff(input.enabled, input.rollout)}`;
  }
  return null;
}

export function History({ rows }: { rows: AuditRow[] }) {
  const inputs = new Map<string, Input>();
  for (const r of rows) {
    if (r.approvalId && r.input) inputs.set(r.approvalId, r.input as Input);
  }
  const visible = rows.filter((r) => r.status !== 'attempted');
  if (visible.length === 0) return <p className="text-sm text-muted-foreground">No changes made in Toolyard yet.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {visible.map((r) => {
        const input = (r.input as Input | null) ?? (r.approvalId ? inputs.get(r.approvalId) : undefined);
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
            <StatusBadge status={r.status} />
            <span className="font-medium">{ACTION_LABELS[r.action] ?? r.action}</span>
            <span>{describe(input)}</span>
            {r.approvedBy ? <span className="text-xs text-muted-foreground">approved by {r.approvedBy}</span> : null}
            {r.error ? <span className="text-xs text-destructive">{r.error}</span> : null}
            <span className="ml-auto text-xs text-muted-foreground">
              {r.actorName ?? r.actorEmail} · <RelativeTime date={r.at} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
