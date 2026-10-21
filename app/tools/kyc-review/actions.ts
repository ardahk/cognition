'use server';

import { z } from 'zod';
import { defineAction } from '@/platform/module';
import manifest from './manifest';
import { DECLINE_REASONS, PII_FIELDS, needsSignoff } from './rules';

const caseId = z.string().regex(/^kyc_[A-Za-z0-9]+$/);
const note = z.string().trim().max(2000).optional().transform((s) => s || undefined);

export const assignToMe = defineAction(manifest, {
  name: 'case.assign',
  permission: 'kyc-review.assign',
  input: z.object({ caseId }),
  target: (i) => ({ type: 'kyc_case', id: i.caseId }),
  handler: async ({ input, ctx }) => {
    const c = await ctx.connectors.kyc.assign(input.caseId, {
      assignee: ctx.user.email,
      idempotencyKey: ctx.idempotencyKey,
    });
    return { caseId: c.id, assignee: c.assignee };
  },
});

export const addNote = defineAction(manifest, {
  name: 'case.note',
  permission: 'kyc-review.note',
  input: z.object({ caseId, body: z.string().trim().min(1).max(2000) }),
  target: (i) => ({ type: 'kyc_case', id: i.caseId }),
  handler: async ({ input, ctx }) => {
    const c = await ctx.connectors.kyc.addNote(input.caseId, {
      author: ctx.user.email,
      body: input.body,
      idempotencyKey: ctx.idempotencyKey,
    });
    return { caseId: c.id, notes: c.notes.length };
  },
});

export const approveCase = defineAction(manifest, {
  name: 'case.approve',
  permission: 'kyc-review.decide',
  // `signoff` is the page's hint for when to route through sign-off; the handler
  // re-checks the case so a missing hint can never skip the compliance officer.
  input: z.object({ caseId, note, signoff: z.stringbool().default(false) }),
  target: (i) => ({ type: 'kyc_case', id: i.caseId }),
  approval: (i) =>
    i.signoff
      ? {
          permission: 'kyc-review.signoff',
          reason: 'KYC approval with risk score ≥ 70 or a watchlist hit needs compliance sign-off',
        }
      : null,
  handler: async ({ input, ctx }) => {
    const current = await ctx.connectors.kyc.getCase(input.caseId);
    if (needsSignoff(current) && !ctx.approvedBy) {
      throw new Error('This case now needs compliance officer sign-off. Reload the page and request sign-off.');
    }
    if (ctx.approvedBy) ctx.record({ signedOffBy: ctx.approvedBy.email });
    const c = await ctx.connectors.kyc.decide(input.caseId, {
      outcome: 'approve',
      note: input.note,
      reviewer: ctx.user.email,
      idempotencyKey: ctx.idempotencyKey,
    });
    return { caseId: c.id, status: c.status };
  },
});

export const declineCase = defineAction(manifest, {
  name: 'case.decline',
  permission: 'kyc-review.decide',
  input: z.object({ caseId, reasonCode: z.enum(DECLINE_REASONS), note }),
  target: (i) => ({ type: 'kyc_case', id: i.caseId }),
  handler: async ({ input, ctx }) => {
    const c = await ctx.connectors.kyc.decide(input.caseId, {
      outcome: 'decline',
      reasonCode: input.reasonCode,
      note: input.note,
      reviewer: ctx.user.email,
      idempotencyKey: ctx.idempotencyKey,
    });
    return { caseId: c.id, status: c.status };
  },
});

export const requestInfo = defineAction(manifest, {
  name: 'case.request-info',
  permission: 'kyc-review.decide',
  input: z.object({ caseId, note }),
  target: (i) => ({ type: 'kyc_case', id: i.caseId }),
  handler: async ({ input, ctx }) => {
    const c = await ctx.connectors.kyc.decide(input.caseId, {
      outcome: 'request_info',
      note: input.note,
      reviewer: ctx.user.email,
      idempotencyKey: ctx.idempotencyKey,
    });
    return { caseId: c.id, status: c.status };
  },
});

export const escalateCase = defineAction(manifest, {
  name: 'case.escalate',
  permission: 'kyc-review.decide',
  input: z.object({ caseId, note }),
  target: (i) => ({ type: 'kyc_case', id: i.caseId }),
  handler: async ({ input, ctx }) => {
    const c = await ctx.connectors.kyc.decide(input.caseId, {
      outcome: 'escalate',
      note: input.note,
      reviewer: ctx.user.email,
      idempotencyKey: ctx.idempotencyKey,
    });
    return { caseId: c.id, status: c.status };
  },
});

export const revealPii = defineAction(manifest, {
  name: 'case.reveal-pii',
  permission: 'kyc-review.reveal',
  input: z.object({ caseId, field: z.enum(PII_FIELDS), reason: z.string().trim().min(5).max(500) }),
  target: (i) => ({ type: 'kyc_case', id: i.caseId }),
  handler: async ({ input, ctx }) => {
    const value = await ctx.connectors.kyc.getPii(input.caseId, input.field);
    return { field: input.field, value };
  },
});
