import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '@/platform/db/client';
import { approvalRequests, auditEvents } from '@/platform/db/schema';
import { permissionsFor } from '@/platform/access';
import { rolesForGroups } from '@/platform/auth/roles';
import { PERSONAS } from '@/platform/auth/personas';
import type { Session, SessionUser } from '@/platform/auth/session';
import { decideApproval } from '@/platform/approvals/service';
import { listApprovals } from '@/platform/approvals/store';
import { signInAs, useInProcessVendors } from '@/tests/helpers';
import { breakGlass, refund, refundCalls } from '@/tests/fixtures/actions';
import { payments } from '@/mock-vendors/schema';

vi.mock('@/platform/registry.generated', async () => {
  const { manifest, access } = await import('@/tests/fixtures/test-module');
  return { modules: [{ manifest, access }] };
});
vi.mock('@/platform/actions.generated', async () => {
  const a = await import('@/tests/fixtures/actions');
  return { moduleActions: [{ module: 'test-refunds', actions: a }] };
});

function sessionFor(user: SessionUser): Session {
  const roles = rolesForGroups(user.groups);
  return { user, roles, permissions: permissionsFor(roles) };
}

const priya = sessionFor(PERSONAS.priya);
const sam = sessionFor(PERSONAS.sam);
const otherOpsLead = sessionFor({
  id: 'olivia',
  email: 'olivia@fernpay.test',
  name: 'Olivia Chen',
  title: 'Operations Lead',
  groups: ['okta:ops-leads'],
} as SessionUser);

async function pickPayment(minAmount: number) {
  const rows = await db.select().from(payments).where(eq(payments.status, 'succeeded'));
  const p = rows.find((r) => r.amount - r.amountRefunded >= minAmount && r.amountRefunded === 0);
  if (!p) throw new Error('no suitable seeded payment');
  return p;
}

async function createRequest() {
  const key = crypto.randomUUID();
  const p = await pickPayment(30_000);
  const res = await refund({ paymentId: p.id, amount: 30_000, idempotencyKey: key });
  if (!(res.ok && res.status === 'pending_approval')) throw new Error('expected pending_approval');
  return { id: res.approvalId, key };
}

async function rowsForKey(key: string) {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.idempotencyKey, key))
    .orderBy(auditEvents.id);
}

describe('decideApproval', () => {
  beforeEach(async () => {
    await sql`TRUNCATE audit_events`;
    await sql`TRUNCATE approval_requests`;
    refundCalls.length = 0;
    signInAs('alex');
    useInProcessVendors();
  });

  it('blocks self-approval even with the permission', async () => {
    signInAs('priya');
    const { id } = await createRequest();
    const res = await decideApproval(priya, { id, decision: 'approve' });
    expect(res).toMatchObject({ ok: false, error: 'SELF_APPROVAL' });
  });

  it('FORBIDDEN for an approver without the permission, with a denied row', async () => {
    const { id } = await createRequest();
    const res = await decideApproval(sam, { id, decision: 'approve' });
    expect(res).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    const rows = await db.select().from(auditEvents).where(eq(auditEvents.status, 'denied'));
    expect(rows).toHaveLength(1);
    expect(rows[0].actorEmail).toBe('sam@fernpay.test');
  });

  it('approve executes the handler exactly once with the stored input and key', async () => {
    const { id, key } = await createRequest();
    const res = await decideApproval(priya, { id, decision: 'approve' });
    expect(res).toMatchObject({ ok: true, status: 'executed' });
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0].key).toBe(key);
    expect(refundCalls[0].input.amount).toBe(30_000);
    const [request] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, id));
    expect(request.status).toBe('executed');
    // Only ctx.record() data is stored; `duplicate` is returned to the caller, never persisted.
    expect(request.result).toEqual({
      refundId: expect.stringMatching(/^re_/),
      ledgerTransactionId: expect.any(String),
    });
    expect(request.result).not.toHaveProperty('duplicate');
    const rows = await rowsForKey(key);
    const statuses = rows.map((r) => r.status);
    expect(statuses).toContain('approved');
    expect(statuses.slice(-2)).toEqual(['attempted', 'succeeded']);
    expect(rows.find((r) => r.status === 'approved')?.actorEmail).toBe('priya@fernpay.test');
    const attempted = rows.find((r) => r.status === 'attempted')!;
    expect(attempted.actorEmail).toBe('alex@fernpay.test');
    expect(attempted.approvedBy).toBe('priya@fernpay.test');
    expect(attempted.approvalId).toBe(id);
  });

  it('two concurrent approves → exactly one execution, other gets NOT_PENDING', async () => {
    const { id } = await createRequest();
    const [r1, r2] = await Promise.all([
      decideApproval(priya, { id, decision: 'approve' }),
      decideApproval(otherOpsLead, { id, decision: 'approve' }),
    ]);
    const results = [r1, r2].map((r) => (r.ok ? r.status : r.error));
    expect(results.filter((s) => s === 'executed')).toHaveLength(1);
    expect(results.filter((s) => s === 'NOT_PENDING')).toHaveLength(1);
    expect(refundCalls).toHaveLength(1);
  });

  it('reject → rejected + audit; later approve → NOT_PENDING', async () => {
    const { id, key } = await createRequest();
    const res = await decideApproval(priya, { id, decision: 'reject', note: 'too risky' });
    expect(res).toMatchObject({ ok: true, status: 'rejected' });
    const [request] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, id));
    expect(request.status).toBe('rejected');
    expect(request.decisionNote).toBe('too risky');
    const rows = await rowsForKey(key);
    expect(rows.map((r) => r.status)).toContain('rejected');
    const late = await decideApproval(otherOpsLead, { id, decision: 'approve' });
    expect(late).toMatchObject({ ok: false, error: 'NOT_PENDING' });
  });

  it('post-hoc: actor cannot self-review; another reviewer marks reviewed', async () => {
    signInAs('priya');
    const key = crypto.randomUUID();
    const res = await breakGlass({ idempotencyKey: key });
    if (!(res.ok && res.status === 'succeeded' && res.reviewId)) throw new Error('expected reviewId');
    const self = await decideApproval(priya, { id: res.reviewId, decision: 'approve' });
    expect(self).toMatchObject({ ok: false, error: 'SELF_APPROVAL' });
    const reviewed = await decideApproval(otherOpsLead, { id: res.reviewId, decision: 'approve' });
    expect(reviewed).toMatchObject({ ok: true, status: 'reviewed' });
    const [request] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, res.reviewId));
    expect(request.status).toBe('reviewed');
    const rows = await rowsForKey(key);
    expect(rows.map((r) => r.status)).toContain('reviewed');
    expect(rows.find((r) => r.status === 'reviewed')?.actorEmail).toBe('olivia@fernpay.test');
  });

  it('post-hoc: a same-key re-submit after review must not reopen the request', async () => {
    signInAs('priya');
    const key = crypto.randomUUID();
    const res = await breakGlass({ idempotencyKey: key });
    if (!(res.ok && res.status === 'succeeded' && res.reviewId)) throw new Error('expected reviewId');
    await decideApproval(otherOpsLead, { id: res.reviewId, decision: 'approve' });

    const again = await breakGlass({ idempotencyKey: key });
    expect(again.ok && again.status === 'succeeded').toBe(true);

    const [request] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, res.reviewId));
    expect(request.status).toBe('reviewed');
  });

  it('needsMyApproval lists a pending request only for users holding its approver permission, never its requester', async () => {
    const queueOf = async (s: Session) =>
      (await listApprovals.needsMyApproval(s)).map((r) => r.id);
    const { id } = await createRequest();
    expect(await queueOf(priya)).toContain(id);
    expect(await queueOf(sam)).not.toContain(id);

    signInAs('priya');
    const own = await createRequest();
    expect(await queueOf(priya)).toContain(id);
    expect(await queueOf(priya)).not.toContain(own.id);
    expect(await queueOf(otherOpsLead)).toContain(own.id);
  });

  it('needsReview lists a post-hoc item for other reviewers but not the actor', async () => {
    signInAs('priya');
    const res = await breakGlass({ idempotencyKey: crypto.randomUUID() });
    if (!(res.ok && res.status === 'succeeded' && res.reviewId)) throw new Error('expected reviewId');
    const reviewOf = async (s: Session) =>
      (await listApprovals.needsReview(s)).map((r) => r.id);
    expect(await reviewOf(otherOpsLead)).toContain(res.reviewId);
    expect(await reviewOf(priya)).not.toContain(res.reviewId);
    expect(await reviewOf(sam)).not.toContain(res.reviewId);
  });
});
