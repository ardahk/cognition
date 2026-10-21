import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/platform/auth/session';
import { rolesWithPermission } from '@/platform/access';
import { modules } from '@/platform/registry.generated';
import { CONNECTOR_SCOPES, type ConnectorName } from '@/platform/connectors/scopes';
import { PageHeader, RISK_COLORS } from '@/platform/ui';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const GOLDEN_RULES = [
  'Reads go through moduleContext(); writes go through defineAction().',
  'Server Actions are public POST endpoints — defineAction is the only sanctioned way to write one.',
  'If the platform lacks something, say so in the PR; never edit platform/ from a tool.',
  'Sensitive or irreversible actions get an approval rule; the platform blocks self-approval.',
  'Never call a connector inside a DB transaction.',
  'Every state-changing connector call passes ctx.idempotencyKey; ledger externalId is the source object id.',
  'PII stays masked; raw values only via an audited action that requires a reason.',
  'Money is integer minor units; display with <Money>, parse with the money zod helper.',
];

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.permissions.has('platform.admin.view')) notFound();

  return (
    <div>
      <PageHeader title="Admin" description="Module inventory and the rules of the road." />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tool</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Connector scopes</TableHead>
            <TableHead>Permissions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {modules.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No tools registered yet.
              </TableCell>
            </TableRow>
          ) : (
            modules.map(({ manifest }) => (
              <TableRow key={manifest.id}>
                <TableCell>
                  <Link href={`/tools/${manifest.id}`} className="font-medium hover:underline">
                    {manifest.name}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{manifest.id}</div>
                </TableCell>
                <TableCell>{manifest.owner}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn('border-transparent', RISK_COLORS[manifest.risk])}
                  >
                    {manifest.risk}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(manifest.connectors).flatMap(([connector, scopes]) =>
                      (scopes ?? []).map((scope) => {
                        const tier =
                          CONNECTOR_SCOPES[connector as ConnectorName][
                            scope as keyof (typeof CONNECTOR_SCOPES)[ConnectorName]
                          ];
                        return (
                          <Badge
                            key={`${connector}.${scope}`}
                            variant="outline"
                            className={cn('border-transparent font-mono', RISK_COLORS[tier])}
                          >
                            {connector}.{scope}
                          </Badge>
                        );
                      }),
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 text-xs">
                    {manifest.permissions.map((p) => (
                      <div key={p}>
                        <span className="font-mono">
                          {p}
                          {p === manifest.viewPermission ? ' (view)' : ''}
                        </span>
                        <span className="text-muted-foreground">
                          {' '}
                          → {rolesWithPermission(p).join(', ') || 'no roles'}
                        </span>
                      </div>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="mt-8 rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">Guardrails</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {GOLDEN_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
