import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { approvalRequests } from '../db/schema';
import type { Session } from '../auth/session';

export type NewApprovalRequest = typeof approvalRequests.$inferInsert;

export async function createApprovalRequest(values: NewApprovalRequest) {
  const [inserted] = await db
    .insert(approvalRequests)
    .values(values)
    .onConflictDoNothing({
      target: [approvalRequests.module, approvalRequests.action, approvalRequests.idempotencyKey],
    })
    .returning();
  if (inserted) return { request: inserted, created: true };
  const [existing] = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.module, values.module),
        eq(approvalRequests.action, values.action),
        eq(approvalRequests.idempotencyKey, values.idempotencyKey),
      ),
    );
  return { request: existing, created: false };
}

export function getApproval(id: string) {
  return db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, id))
    .then((r) => r[0] ?? null);
}

export const listApprovals = {
  needsMyApproval(session: Session) {
    return db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.mode, 'pre'),
          eq(approvalRequests.status, 'pending'),
          session.permissions.size
            ? inArray(approvalRequests.approverPermission, [...session.permissions])
            : sql`false`,
          ne(approvalRequests.requestedById, session.user.id),
        ),
      )
      .orderBy(desc(approvalRequests.requestedAt));
  },
  needsReview(session: Session) {
    return db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.mode, 'post-hoc'),
          eq(approvalRequests.status, 'pending_review'),
          session.permissions.size
            ? inArray(approvalRequests.approverPermission, [...session.permissions])
            : sql`false`,
          ne(approvalRequests.requestedById, session.user.id),
        ),
      )
      .orderBy(desc(approvalRequests.requestedAt));
  },
  myRequests(userId: string) {
    return db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.requestedById, userId))
      .orderBy(desc(approvalRequests.requestedAt));
  },
};

export function pendingForModule(module: string, target?: { type: string; id: string }) {
  return db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.module, module),
        inArray(approvalRequests.status, ['pending', 'pending_review']),
        target ? eq(approvalRequests.targetType, target.type) : undefined,
        target ? eq(approvalRequests.targetId, target.id) : undefined,
      ),
    )
    .orderBy(desc(approvalRequests.requestedAt));
}
