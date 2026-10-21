import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { moduleContext } from '@/platform/module';
import { ActionForm, PageHeader, RelativeTime, StatusBadge } from '@/platform/ui';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import manifest from '../manifest';
import { killFlag, setFlag } from '../actions';
import { EnvState } from '../env-state';
import { History } from '../history';
import { ENVIRONMENTS, flagTarget } from '../rules';

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function FlagPage({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await moduleContext(manifest);
  const { key } = await params;
  const flag = await ctx.connectors.flags.getFlag(decodeURIComponent(key)).catch((e: { status?: number }) => {
    if (e?.status === 404) notFound();
    throw e;
  });
  const target = flagTarget(flag.key);
  const [pending, history] = await Promise.all([ctx.pendingApprovals(target), ctx.auditTrail(target)]);
  const canEdit = ctx.can('feature-flags.edit');
  const prodOn = flag.environments.production.enabled;

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/tools/${manifest.id}`} className="text-sm text-muted-foreground hover:underline">
        ← All flags
      </Link>
      <PageHeader title={flag.name} description={flag.description} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="font-mono text-xs">{flag.key}</span>
        <span>Owner {flag.owner}</span>
        <span className="flex gap-1">
          {flag.tags.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </span>
        <span className="text-muted-foreground">
          Last change <RelativeTime date={flag.updated_at} /> by {flag.updated_by} · v{flag.version}
        </span>
      </div>

      {pending.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          <ul className="flex flex-col gap-1">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <StatusBadge status={p.status} />
                <span>{p.reason}</span>
                <span className="text-xs">
                  requested by {p.requestedByName} <RelativeTime date={p.requestedAt ?? new Date()} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            An eng lead decides these in{' '}
            <Link href={`/approvals?tab=${pending.some((p) => p.mode === 'pre') ? 'needs-approval' : 'needs-review'}`} className="underline">
              Approvals
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {ENVIRONMENTS.map((env) => {
          const state = flag.environments[env];
          const prod = env === 'production';
          return (
            <Section
              key={env}
              title={
                <span className="flex items-center justify-between gap-2 capitalize">
                  {env} <EnvState state={state} />
                </span>
              }
            >
              {canEdit ? (
                <ActionForm
                  action={setFlag}
                  hidden={{ key: flag.key, env }}
                  submitLabel={prod ? 'Request approval' : 'Save'}
                  className="flex flex-col gap-2 text-sm"
                >
                  <label className="flex items-center justify-between gap-2">
                    State
                    <select name="enabled" defaultValue={String(state.enabled)} className={selectClass}>
                      <option value="true">On</option>
                      <option value="false">Off</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    Rollout %
                    <Input
                      name="rollout"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      required
                      defaultValue={state.rollout_percentage}
                      className="h-8 w-24"
                    />
                  </label>
                  {prod ? (
                    <p className="text-xs text-muted-foreground">Production changes apply after an eng lead approves.</p>
                  ) : null}
                </ActionForm>
              ) : (
                <p className="text-sm text-muted-foreground">Read only.</p>
              )}
            </Section>
          );
        })}
      </div>

      {ctx.can('feature-flags.kill') ? (
        <Section title="Production kill switch">
          {prodOn ? (
            <ActionForm
              action={killFlag}
              hidden={{ key: flag.key }}
              submitLabel="Turn off in production now"
              confirm={`Turn ${flag.key} off in production immediately?`}
              className="flex flex-col gap-2"
            >
              <p className="text-sm text-muted-foreground">
                Turns the flag off in production right away. An eng lead reviews it afterwards.
              </p>
              <Textarea name="reason" required minLength={5} maxLength={500} rows={2} placeholder="Why? (incident link, symptoms)" />
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">Already off in production.</p>
          )}
        </Section>
      ) : null}

      <Section title="Change history">
        <History rows={history} />
      </Section>
    </div>
  );
}
