import { and, asc, eq, gt } from 'drizzle-orm';
import { kycCases, kycNotes } from './schema';
import { vendorError, type Route } from './router';

function limitOf(query: URLSearchParams) {
  const n = Number(query.get('limit') ?? 25);
  return Math.max(1, Math.min(100, Number.isFinite(n) ? Math.floor(n) : 25));
}

async function caseShape(db: Parameters<Route['handler']>[0]['db'], c: typeof kycCases.$inferSelect) {
  const notes = await db
    .select()
    .from(kycNotes)
    .where(eq(kycNotes.caseId, c.id))
    .orderBy(asc(kycNotes.seq));
  return {
    id: c.id,
    object: 'kyc_case',
    status: c.status,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    sla_due_at: c.slaDueAt,
    applicant: c.applicant,
    document: c.document,
    selfie: c.selfie,
    watchlist: c.watchlist,
    device: c.device,
    risk_score: c.riskScore,
    risk_level: c.riskLevel,
    assignee: c.assignee,
    decision: c.decision,
    notes: notes.map((n) => ({
      id: n.id,
      author: n.author,
      body: n.body,
      created_at: n.createdAt,
    })),
  };
}

const notFound = (id: string) => ({
  status: 404,
  body: vendorError('not_found', `No such case ${id}`),
});

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/v1/cases',
    handler: async ({ query, db }) => {
      const limit = limitOf(query);
      const conds = [];
      const status = query.get('status');
      if (status) conds.push(eq(kycCases.status, status as typeof kycCases.$inferSelect.status));
      const risk = query.get('risk');
      if (risk) conds.push(eq(kycCases.riskLevel, risk as typeof kycCases.$inferSelect.riskLevel));
      const assignee = query.get('assignee');
      if (assignee) conds.push(eq(kycCases.assignee, assignee));
      const after = query.get('starting_after');
      if (after) {
        const [c] = await db.select().from(kycCases).where(eq(kycCases.id, after));
        if (!c) return { status: 404, body: vendorError('not_found', `No such case ${after}`) };
        conds.push(gt(kycCases.seq, c.seq));
      }
      const rows = await db
        .select()
        .from(kycCases)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(asc(kycCases.createdAt), asc(kycCases.seq))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const data = await Promise.all(rows.slice(0, limit).map((c) => caseShape(db, c)));
      return { body: { object: 'list', data, has_more: hasMore } };
    },
  },
  {
    method: 'GET',
    path: '/v1/cases/:id',
    handler: async ({ params, db }) => {
      const [c] = await db.select().from(kycCases).where(eq(kycCases.id, params.id));
      if (!c) return notFound(params.id);
      return { body: await caseShape(db, c) };
    },
  },
  {
    method: 'POST',
    path: '/v1/cases/:id/decision',
    handler: async ({ params, body, db }) => {
      const input = (body ?? {}) as {
        outcome?: string;
        reason_code?: string;
        note?: string;
        reviewer?: string;
      };
      const statuses: Record<string, typeof kycCases.$inferSelect.status> = {
        approve: 'approved',
        decline: 'declined',
        request_info: 'needs_info',
        escalate: 'escalated',
      };
      const status = input.outcome ? statuses[input.outcome] : undefined;
      if (!status) {
        return {
          status: 422,
          body: vendorError('validation_error', `Invalid outcome ${input.outcome}`),
        };
      }
      if (!input.reviewer) {
        return { status: 422, body: vendorError('validation_error', 'reviewer is required') };
      }
      const [c] = await db.select().from(kycCases).where(eq(kycCases.id, params.id));
      if (!c) return notFound(params.id);
      if (c.status === 'approved' || c.status === 'declined') {
        return {
          status: 409,
          body: vendorError('invalid_state', `Case is already ${c.status}`),
        };
      }
      const now = new Date().toISOString();
      const [updated] = await db
        .update(kycCases)
        .set({
          status,
          updatedAt: now,
          decision: {
            outcome: input.outcome!,
            reason_code: input.reason_code ?? null,
            note: input.note ?? null,
            decided_by: input.reviewer,
            decided_at: now,
          },
        })
        .where(eq(kycCases.id, c.id))
        .returning();
      return { body: await caseShape(db, updated) };
    },
  },
  {
    method: 'POST',
    path: '/v1/cases/:id/assign',
    handler: async ({ params, body, db }) => {
      const input = (body ?? {}) as { assignee?: string };
      if (!input.assignee) {
        return { status: 422, body: vendorError('validation_error', 'assignee is required') };
      }
      const [c] = await db.select().from(kycCases).where(eq(kycCases.id, params.id));
      if (!c) return notFound(params.id);
      const [updated] = await db
        .update(kycCases)
        .set({ assignee: input.assignee, updatedAt: new Date().toISOString() })
        .where(eq(kycCases.id, c.id))
        .returning();
      return { body: await caseShape(db, updated) };
    },
  },
  {
    method: 'POST',
    path: '/v1/cases/:id/notes',
    handler: async ({ params, body, db }) => {
      const input = (body ?? {}) as { author?: string; body?: string };
      if (!input.author || !input.body) {
        return {
          status: 422,
          body: vendorError('validation_error', 'author and body are required'),
        };
      }
      const [c] = await db.select().from(kycCases).where(eq(kycCases.id, params.id));
      if (!c) return notFound(params.id);
      const now = new Date().toISOString();
      await db.insert(kycNotes).values({
        id: `note_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`,
        caseId: c.id,
        author: input.author,
        body: input.body,
        createdAt: now,
      });
      const [updated] = await db
        .update(kycCases)
        .set({ updatedAt: now })
        .where(eq(kycCases.id, c.id))
        .returning();
      return { body: await caseShape(db, updated) };
    },
  },
];
