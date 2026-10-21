import {
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    attemptId: uuid('attempt_id'),
    idempotencyKey: text('idempotency_key'),
    actorId: text('actor_id').notNull(),
    actorEmail: text('actor_email').notNull(),
    actorName: text('actor_name'),
    actorRoles: text('actor_roles').array().notNull().default([]),
    module: text('module').notNull(),
    action: text('action').notNull(),
    status: text('status').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    approvalId: uuid('approval_id'),
    approvedBy: text('approved_by'),
    input: jsonb('input'),
    result: jsonb('result'),
    error: text('error'),
  },
  (t) => [
    index('audit_events_attempt_id_idx').on(t.attemptId),
    index('audit_events_module_at_idx').on(t.module, t.at),
    index('audit_events_target_idx').on(t.module, t.targetType, t.targetId),
  ],
);

export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    module: text('module').notNull(),
    action: text('action').notNull(),
    mode: text('mode', { enum: ['pre', 'post-hoc'] }).notNull(),
    status: text('status', {
      enum: ['pending', 'executing', 'executed', 'failed', 'rejected', 'pending_review', 'reviewed'],
    }).notNull(),
    input: jsonb('input').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    reason: text('reason').notNull(),
    approverPermission: text('approver_permission').notNull(),
    requestedById: text('requested_by_id').notNull(),
    requestedByEmail: text('requested_by_email').notNull(),
    requestedByName: text('requested_by_name').notNull(),
    requestedByRoles: text('requested_by_roles').array().notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow(),
    decidedById: text('decided_by_id'),
    decidedByEmail: text('decided_by_email'),
    decidedByName: text('decided_by_name'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    attemptId: uuid('attempt_id'),
    result: jsonb('result'),
    error: text('error'),
  },
  (t) => [
    uniqueIndex('approval_requests_dedupe_idx').on(t.module, t.action, t.idempotencyKey),
  ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
