import { beforeEach, describe, expect, it } from 'vitest';
import { moduleContext } from '@/platform/module';
import { decideAs, signInAs, useInProcessVendors } from '@/tests/helpers';
import manifest from './manifest';
import access from './access';
import { addNote, approveCase, assignToMe, declineCase, escalateCase, requestInfo, revealPii } from './actions';
import { needsSignoff } from './rules';

type Persona = Parameters<typeof signInAs>[0];

async function as(persona: Persona) {
  signInAs(persona);
  return moduleContext(manifest);
}

async function pendingCases() {
  const ctx = await as('sam');
  const { data } = await ctx.connectors.kyc.listCases({ status: 'pending_review', limit: 100 });
  return data;
}

const used = new Set<string>();
async function takeCase(pred: (c: Awaited<ReturnType<typeof pendingCases>>[number]) => boolean) {
  const c = (await pendingCases()).find((x) => !used.has(x.id) && pred(x));
  if (!c) throw new Error('no suitable seeded case');
  used.add(c.id);
  return c;
}

const lowRisk = (c: Parameters<typeof needsSignoff>[0]) => !needsSignoff(c);

async function statusOf(id: string) {
  const ctx = await as('sam');
  return (await ctx.connectors.kyc.getCase(id)).status;
}

beforeEach(() => {
  useInProcessVendors();
});

describe('needsSignoff', () => {
  const clear = { status: 'clear', hits: [] };
  const hit = { status: 'hit', hits: [{ list: 'PEP' }] };
  it('is needed at a risk score of 70 or more', () => {
    expect(needsSignoff({ risk_score: 69, watchlist: clear })).toBe(false);
    expect(needsSignoff({ risk_score: 70, watchlist: clear })).toBe(true);
    expect(needsSignoff({ risk_score: 96, watchlist: clear })).toBe(true);
  });
  it('is needed for any watchlist hit, whatever the score', () => {
    expect(needsSignoff({ risk_score: 5, watchlist: hit })).toBe(true);
  });
});

describe('access', () => {
  it.each(['alex', 'priya', 'jordan', 'taylor'] as const)('%s cannot open the tool (404)', async (p) => {
    await expect(as(p)).rejects.toThrow('notFound()');
  });

  it.each(['sam', 'morgan'] as const)('%s can open the tool', async (p) => {
    await expect(as(p)).resolves.toBeTruthy();
  });

  it('no role can both make a decision and sign it off', () => {
    for (const perms of Object.values(access.grants) as string[][]) {
      expect(perms.includes('kyc-review.decide') && perms.includes('kyc-review.signoff')).toBe(false);
    }
  });

  it('only compliance officers can reveal PII; only analysts can decide', async () => {
    const c = await takeCase(lowRisk);
    signInAs('sam');
    expect(await revealPii({ caseId: c.id, field: 'dob', reason: 'Verifying identity' })).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    signInAs('morgan');
    expect(await approveCase({ caseId: c.id })).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect(await assignToMe({ caseId: c.id })).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    signInAs('alex');
    expect(await addNote({ caseId: c.id, body: 'hi' })).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect(await statusOf(c.id)).toBe('pending_review');
  });
});

describe('approve', () => {
  it('a low-risk case with no watchlist hit is approved directly', async () => {
    const c = await takeCase(lowRisk);
    signInAs('sam');
    const res = await approveCase({ caseId: c.id, signoff: 'false' });
    expect(res).toMatchObject({ ok: true, status: 'succeeded', data: { status: 'approved' } });
  });

  it('a risk score of 70+ waits for compliance sign-off', async () => {
    const c = await takeCase((x) => x.risk_score >= 70);
    signInAs('sam');
    const res = await approveCase({ caseId: c.id, signoff: 'true' });
    expect(res).toMatchObject({ ok: true, status: 'pending_approval' });
    expect(await statusOf(c.id)).toBe('pending_review');

    const ctx = await as('sam');
    const [pending] = await ctx.pendingApprovals({ type: 'kyc_case', id: c.id });
    expect(pending).toMatchObject({
      action: 'case.approve',
      approverPermission: 'kyc-review.signoff',
      requestedById: 'sam',
    });
  });

  it('a compliance officer signs off, the case is decided as the analyst, and the request cannot be decided twice', async () => {
    const c = await takeCase((x) => x.risk_score >= 70);
    signInAs('sam');
    const res = await approveCase({ caseId: c.id, signoff: 'true' });
    expect(res).toMatchObject({ ok: true, status: 'pending_approval' });
    const approvalId = (res as { approvalId: string }).approvalId;

    expect(await decideAs('morgan', approvalId, 'approve')).toMatchObject({
      ok: true,
      status: 'executed',
    });
    const ctx = await as('morgan');
    const after = await ctx.connectors.kyc.getCase(c.id);
    expect(after.status).toBe('approved');
    expect(after.decision).toMatchObject({ outcome: 'approve', decided_by: 'sam@fernpay.test' });

    expect(await decideAs('morgan', approvalId, 'approve')).toMatchObject({
      ok: false,
      error: 'NOT_PENDING',
    });
  });

  it('a watchlist hit waits for sign-off even with a low score', async () => {
    const c = await takeCase((x) => x.watchlist.status === 'hit');
    signInAs('sam');
    expect(await approveCase({ caseId: c.id, signoff: 'true' })).toMatchObject({ status: 'pending_approval' });
    expect(await statusOf(c.id)).toBe('pending_review');
  });

  it('skipping the sign-off flag on a high-risk case does not approve it', async () => {
    const c = await takeCase((x) => x.risk_score >= 70);
    signInAs('sam');
    const res = await approveCase({ caseId: c.id, signoff: 'false' });
    expect(res).toMatchObject({ ok: false, error: 'FAILED' });
    expect(await statusOf(c.id)).toBe('pending_review');
  });
});

describe('other decisions', () => {
  it('decline requires a known reason code', async () => {
    const c = await takeCase((x) => x.risk_score >= 70);
    signInAs('sam');
    expect(await declineCase({ caseId: c.id })).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect(await declineCase({ caseId: c.id, reasonCode: 'because' })).toMatchObject({
      ok: false,
      error: 'INVALID_INPUT',
    });
    const res = await declineCase({ caseId: c.id, reasonCode: 'document_mismatch', note: 'Name differs' });
    expect(res).toMatchObject({ ok: true, status: 'succeeded', data: { status: 'declined' } });
    const ctx = await as('sam');
    expect((await ctx.connectors.kyc.getCase(c.id)).decision).toMatchObject({
      outcome: 'decline',
      reason_code: 'document_mismatch',
      decided_by: 'sam@fernpay.test',
    });
  });

  it('request info and escalate need no sign-off, even for high-risk cases', async () => {
    const a = await takeCase((x) => x.risk_score >= 70);
    const b = await takeCase((x) => x.risk_score >= 70);
    signInAs('sam');
    expect(await requestInfo({ caseId: a.id })).toMatchObject({ status: 'succeeded', data: { status: 'needs_info' } });
    expect(await escalateCase({ caseId: b.id })).toMatchObject({ status: 'succeeded', data: { status: 'escalated' } });
  });
});

describe('assign and notes', () => {
  it('assign always assigns the signed-in analyst', async () => {
    const c = await takeCase(lowRisk);
    signInAs('sam');
    const res = await assignToMe({ caseId: c.id, assignee: 'someone@else.test' });
    expect(res).toMatchObject({ ok: true, data: { assignee: 'sam@fernpay.test' } });
  });

  it('notes are authored by the signed-in user', async () => {
    const c = await takeCase(lowRisk);
    signInAs('morgan');
    expect(await addNote({ caseId: c.id, body: 'Looks fine' })).toMatchObject({ ok: true });
    const ctx = await as('morgan');
    const notes = (await ctx.connectors.kyc.getCase(c.id)).notes;
    expect(notes.at(-1)).toMatchObject({ author: 'morgan@fernpay.test', body: 'Looks fine' });
  });
});

describe('PII', () => {
  it('reads stay masked', async () => {
    const c = await takeCase(lowRisk);
    const ctx = await as('morgan');
    const masked = await ctx.connectors.kyc.getCase(c.id);
    const raw = await revealPii({ caseId: c.id, field: 'email', reason: 'Confirming contact details' });
    expect(raw).toMatchObject({ ok: true });
    const value = (raw as { data: { value: string } }).data.value;
    expect(value).toContain('@');
    expect(masked.applicant.email).not.toBe(value);
  });

  it('reveal needs a reason and is logged with the field and reason', async () => {
    const c = await takeCase(lowRisk);
    signInAs('morgan');
    expect(await revealPii({ caseId: c.id, field: 'dob' })).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect(await revealPii({ caseId: c.id, field: 'dob', reason: '' })).toMatchObject({
      ok: false,
      error: 'INVALID_INPUT',
    });
    expect(await revealPii({ caseId: c.id, field: 'everything', reason: 'Need it all' })).toMatchObject({
      ok: false,
      error: 'INVALID_INPUT',
    });
    const res = await revealPii({ caseId: c.id, field: 'dob', reason: 'Age check for case review' });
    expect(res).toMatchObject({ ok: true, status: 'succeeded' });
    const value = (res as { data: { value: string } }).data.value;
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const ctx = await as('morgan');
    const trail = await ctx.auditTrail({ type: 'kyc_case', id: c.id });
    const reveal = trail.find((e) => e.action === 'kyc-review.case.reveal-pii' && e.status === 'succeeded');
    expect(reveal).toMatchObject({
      actorEmail: 'morgan@fernpay.test',
      input: { caseId: c.id, field: 'dob', reason: 'Age check for case review' },
    });
    // The raw value reaches the caller only — it must not land in the audit log.
    expect(reveal?.result).toBeNull();
    expect(JSON.stringify(trail)).not.toContain(value);
  });
});
