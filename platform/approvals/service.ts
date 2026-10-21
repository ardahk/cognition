import 'server-only';
import { and, eq } from 'drizzle-orm';
import { moduleActions } from '../actions.generated';
import { db } from '../db/client';
import { approvalRequests } from '../db/schema';
import { writeAudit } from '../audit';
import { execute, ACTION_META, type ActionMeta } from '../module';
import { getApproval } from './store';
import type { Session, SessionUser } from '../auth/session';
import type { Role } from '../auth/roles';

type DecideResult =
  | { ok: true; status: string; message?: string }
  | {
      ok: false;
      error: 'NOT_FOUND' | 'FORBIDDEN' | 'SELF_APPROVAL' | 'NOT_PENDING';
      message: string;
    };

function auditFields(session: Session, request: typeof approvalRequests.$inferSelect) {
  return {
    module: request.module,
    action: `${request.module}.${request.action}`,
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorName: session.user.name,
    actorRoles: session.roles,
    approvalId: request.id,
    idempotencyKey: request.idempotencyKey,
    targetType: request.targetType,
    targetId: request.targetId,
  };
}

export async function decideApproval(
  session: Session,
  { id, decision, note }: { id: string; decision: 'approve' | 'reject'; note?: string },
): Promise<DecideResult> {
  const request = await getApproval(id);
  if (!request) return { ok: false, error: 'NOT_FOUND', message: `No approval request ${id}` };

  if (!session.permissions.has(request.approverPermission)) {
    await writeAudit({ ...auditFields(session, request), status: 'denied' });
    return {
      ok: false,
      error: 'FORBIDDEN',
      message: `Missing permission ${request.approverPermission}`,
    };
  }
  if (request.requestedById === session.user.id) {
    return { ok: false, error: 'SELF_APPROVAL', message: 'You cannot decide your own request' };
  }

  const decidedBy = {
    decidedById: session.user.id,
    decidedByEmail: session.user.email,
    decidedByName: session.user.name,
    decidedAt: new Date(),
    decisionNote: note ?? null,
  };

  if (request.mode === 'post-hoc') {
    const wanted = 'pending_review';
    const [claimed] = await db
      .update(approvalRequests)
      .set({ status: decision === 'approve' ? 'reviewed' : 'rejected', ...decidedBy })
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.status, wanted)))
      .returning();
    if (!claimed) {
      return { ok: false, error: 'NOT_PENDING', message: 'Request is not pending review' };
    }
    await writeAudit({
      ...auditFields(session, request),
      status: decision === 'approve' ? 'reviewed' : 'rejected',
    });
    return { ok: true, status: claimed.status };
  }

  // mode === 'pre'
  if (decision === 'reject') {
    const [claimed] = await db
      .update(approvalRequests)
      .set({ status: 'rejected', ...decidedBy })
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.status, 'pending')))
      .returning();
    if (!claimed) {
      return { ok: false, error: 'NOT_PENDING', message: 'Request is not pending' };
    }
    await writeAudit({ ...auditFields(session, request), status: 'rejected' });
    return { ok: true, status: 'rejected' };
  }

  // pre approve: atomic claim, then run the action as the requester
  const [claimed] = await db
    .update(approvalRequests)
    .set({ status: 'executing', ...decidedBy })
    .where(and(eq(approvalRequests.id, id), eq(approvalRequests.status, 'pending')))
    .returning();
  if (!claimed) {
    return { ok: false, error: 'NOT_PENDING', message: 'Request is not pending' };
  }
  await writeAudit({ ...auditFields(session, request), status: 'approved' });

  const reg = moduleActions.find((m) => m.module === request.module);
  const action = Object.values(reg?.actions ?? {}).find(
    (fn) => (fn as Record<symbol, ActionMeta | undefined>)?.[ACTION_META]?.name === request.action,
  );
  const meta = (action as Record<symbol, ActionMeta | undefined> | undefined)?.[ACTION_META];
  if (!meta) {
    await db
      .update(approvalRequests)
      .set({ status: 'failed', error: `No action ${request.action} in module ${request.module}` })
      .where(eq(approvalRequests.id, id));
    return { ok: false, error: 'NOT_FOUND', message: `No action ${request.action}` };
  }

  const requester: SessionUser = {
    id: request.requestedById,
    email: request.requestedByEmail,
    name: request.requestedByName,
    title: '',
    groups: [],
  };
  const result = await execute(meta, request.input, {
    actor: requester,
    roles: request.requestedByRoles as Role[],
    idempotencyKey: request.idempotencyKey,
    approvalId: request.id,
    approvedBy: session.user,
  });
  await db
    .update(approvalRequests)
    .set({
      status: result.ok ? 'executed' : 'failed',
      attemptId: result.attemptId,
      result: result.recorded,
      error: result.ok ? null : result.message,
    })
    .where(eq(approvalRequests.id, id));
  return result.ok
    ? { ok: true, status: 'executed' }
    : { ok: true, status: 'failed', message: result.message };
}
