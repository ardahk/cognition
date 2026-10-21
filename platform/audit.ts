import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './db/client';
import { auditEvents } from './db/schema';
import type { Role } from './auth/roles';

export type AuditStatus =
  | 'denied'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'attempted'
  | 'succeeded'
  | 'failed'
  | 'reviewed';

export type AuditEventInput = {
  status: AuditStatus;
  module: string;
  action: string;
  actorId: string;
  actorEmail: string;
  actorName?: string | null;
  actorRoles: Role[] | string[];
  attemptId?: string | null;
  idempotencyKey?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  approvalId?: string | null;
  approvedBy?: string | null;
  input?: unknown;
  result?: unknown;
  error?: string | null;
};

export function writeAudit(event: AuditEventInput) {
  return db.insert(auditEvents).values({
    ...event,
    input: event.input === undefined ? null : event.input,
    result: event.result === undefined ? null : event.result,
  } as typeof auditEvents.$inferInsert);
}

export function auditTrail({
  module,
  targetType,
  targetId,
  limit = 50,
}: {
  module: string;
  targetType: string;
  targetId: string;
  limit?: number;
}) {
  return db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.module, module),
        eq(auditEvents.targetType, targetType),
        eq(auditEvents.targetId, targetId),
      ),
    )
    .orderBy(desc(auditEvents.at), desc(auditEvents.id))
    .limit(limit);
}

export function listAudit({
  module,
  actor,
  status,
  unresolved,
  limit = 100,
}: {
  module?: string;
  actor?: string;
  status?: string;
  unresolved?: boolean;
  limit?: number;
}) {
  const conds = [];
  if (module) conds.push(eq(auditEvents.module, module));
  if (actor) conds.push(eq(auditEvents.actorEmail, actor));
  if (unresolved) {
    conds.push(eq(auditEvents.status, 'attempted'));
    conds.push(
      sql`not exists (
        select 1 from audit_events o
        where o.attempt_id = ${auditEvents.attemptId}
          and o.status in ('succeeded', 'failed')
      )`,
    );
  } else if (status) {
    conds.push(eq(auditEvents.status, status));
  }
  return db
    .select()
    .from(auditEvents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditEvents.at), desc(auditEvents.id))
    .limit(limit);
}
