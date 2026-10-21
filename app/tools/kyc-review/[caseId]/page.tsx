import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { moduleContext } from '@/platform/module';
import { ActionButton, ActionForm, Masked, PageHeader, RelativeTime, StatusBadge } from '@/platform/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import manifest from '../manifest';
import { addNote, approveCase, assignToMe, declineCase, escalateCase, requestInfo, revealPii } from '../actions';
import { DECLINE_REASONS, FINAL_STATUSES, needsSignoff, type PiiField } from '../rules';
import { Risk } from '../risk';
import { Sla } from '../sla';

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

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

function NoteField({ placeholder = 'Note (optional)' }: { placeholder?: string }) {
  return <Textarea name="note" placeholder={placeholder} rows={2} maxLength={2000} />;
}

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const ctx = await moduleContext(manifest);
  const { caseId } = await params;
  const c = await ctx.connectors.kyc.getCase(caseId).catch((e: { status?: number }) => {
    if (e?.status === 404) notFound();
    throw e;
  });
  const pending = await ctx.pendingApprovals({ type: 'kyc_case', id: c.id });
  const pendingApprove = pending.find((p) => p.action === 'case.approve');
  const signoff = needsSignoff(c);
  const open = !FINAL_STATUSES.includes(c.status);
  const a = c.applicant;
  const canReveal = ctx.can('kyc-review.reveal');
  const pii = (field: PiiField, value: string) => (
    <Masked value={value} reveal={canReveal ? { action: revealPii, args: { caseId: c.id, field } } : undefined} />
  );

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/tools/${manifest.id}`} className="text-sm text-muted-foreground hover:underline">
        ← Back to queue
      </Link>
      <PageHeader
        title={`${a.first_name} ${a.last_name}`}
        description={c.id}
        actions={
          <>
            <StatusBadge status={c.status} />
            <Risk score={c.risk_score} level={c.risk_level} />
          </>
        }
      />

      {pendingApprove ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          Approval requested by {pendingApprove.requestedByName} is waiting for compliance officer sign-off in{' '}
          <Link href="/approvals" className="underline">
            Approvals
          </Link>
          .
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Applicant">
          <Field label="Nationality">{a.nationality}</Field>
          <Field label="Country">{a.address.country}</Field>
          <Field label="City / region">{`${a.address.city}, ${a.address.region}`}</Field>
          <Field label="Date of birth">{pii('dob', a.dob)}</Field>
          <Field label="SSN last 4">{a.ssn_last4 === null ? '—' : pii('ssn_last4', a.ssn_last4)}</Field>
          <Field label="Address line 1">{pii('address_line1', a.address.line1)}</Field>
          <Field label="Postal code">{pii('postal_code', a.address.postal_code)}</Field>
          <Field label="Email">{pii('email', a.email)}</Field>
          <Field label="Phone">{pii('phone', a.phone)}</Field>
        </Section>

        <Section title="Review">
          <Field label="Created"><RelativeTime date={c.created_at} /></Field>
          <Field label="SLA (24h)"><Sla dueAt={c.sla_due_at} status={c.status} /></Field>
          <Field label="Assignee">{c.assignee ?? 'Unassigned'}</Field>
          {c.decision ? (
            <>
              <Field label="Decision">{c.decision.outcome}</Field>
              {c.decision.reason_code ? <Field label="Reason code">{c.decision.reason_code}</Field> : null}
              {c.decision.note ? <Field label="Decision note">{c.decision.note}</Field> : null}
              <Field label="Decided by">{c.decision.decided_by}</Field>
            </>
          ) : null}
          {ctx.can('kyc-review.assign') && c.assignee !== ctx.user.email ? (
            <div className="pt-2">
              <ActionButton action={assignToMe} args={{ caseId: c.id }} label="Assign to me" variant="outline" />
            </div>
          ) : null}
        </Section>

        <Section title="Document check">
          <Field label="Result"><StatusBadge status={c.document.status} /></Field>
          <Field label="Type">{c.document.type}</Field>
          <Field label="Issuing country">{c.document.issuing_country}</Field>
          <Field label="Document number">{pii('document_number', c.document.number)}</Field>
        </Section>

        <Section title="Selfie check">
          <Field label="Result"><StatusBadge status={c.selfie.status} /></Field>
          <Field label="Match score">{c.selfie.match_score}</Field>
        </Section>

        <Section title="Device signals">
          <Field label="IP country">
            {c.device.ip_country}
            {c.device.ip_country !== a.address.country ? (
              <span className="ml-2 text-amber-700 dark:text-amber-300">≠ applicant country</span>
            ) : null}
          </Field>
          <Field label="VPN">{c.device.vpn ? 'Yes' : 'No'}</Field>
          <Field label="Device risk">{c.device.risk}</Field>
        </Section>

        <Section title="Watchlist / PEP">
          <Field label="Screening"><StatusBadge status={c.watchlist.status} /></Field>
          {c.watchlist.hits.map((h, i) => (
            <div key={i} className="mt-2 flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <Badge variant="outline">{h.list}</Badge>
              <span>{h.matched_name}</span>
              <span className="font-mono text-xs">score {h.score}</span>
            </div>
          ))}
        </Section>
      </div>

      {ctx.can('kyc-review.decide') && open ? (
        <Section title="Decision">
          <div className="grid gap-4 md:grid-cols-2">
            <ActionForm
              action={approveCase}
              hidden={{ caseId: c.id, signoff: String(signoff) }}
              submitLabel={signoff ? 'Request approval sign-off' : 'Approve'}
              className="flex flex-col gap-2"
            >
              <h3 className="text-sm font-medium">Approve</h3>
              {signoff ? (
                <p className="text-xs text-muted-foreground">
                  Risk score ≥ 70 or a watchlist hit: a compliance officer must sign off before this approval takes effect.
                </p>
              ) : null}
              {pendingApprove ? (
                <p className="text-xs text-muted-foreground">An approval is already waiting for sign-off.</p>
              ) : (
                <NoteField />
              )}
            </ActionForm>
            <ActionForm action={declineCase} hidden={{ caseId: c.id }} submitLabel="Decline" className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Decline</h3>
              <select name="reasonCode" required defaultValue="" className={selectClass} aria-label="Reason code">
                <option value="" disabled>
                  Reason code…
                </option>
                {DECLINE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <NoteField />
            </ActionForm>
            <ActionForm action={requestInfo} hidden={{ caseId: c.id }} submitLabel="Request more info" className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Request more info</h3>
              <NoteField placeholder="What do you need from the applicant? (optional)" />
            </ActionForm>
            <ActionForm action={escalateCase} hidden={{ caseId: c.id }} submitLabel="Escalate" className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Escalate</h3>
              <NoteField placeholder="Why are you escalating? (optional)" />
            </ActionForm>
          </div>
        </Section>
      ) : null}

      <Section title="Notes">
        {c.notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet.</p> : null}
        <ul className="flex flex-col gap-2">
          {c.notes.map((n) => (
            <li key={n.id} className="rounded-md border p-2 text-sm">
              <p>{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.author} · <RelativeTime date={n.created_at} />
              </p>
            </li>
          ))}
        </ul>
        {ctx.can('kyc-review.note') ? (
          <ActionForm action={addNote} hidden={{ caseId: c.id }} className="mt-3 flex items-start gap-2">
            <Textarea name="body" required placeholder="Add a note" rows={2} maxLength={2000} className="flex-1" />
            <Button type="submit">Add note</Button>
          </ActionForm>
        ) : null}
      </Section>
    </div>
  );
}
