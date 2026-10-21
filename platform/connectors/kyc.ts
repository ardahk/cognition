import { z } from 'zod';
import type { RequestFn } from './http';

export const kycNoteSchema = z.object({
  id: z.string(),
  author: z.string(),
  body: z.string(),
  created_at: z.string(),
});

export const kycCaseSchema = z.object({
  id: z.string(),
  object: z.literal('kyc_case'),
  status: z.enum(['pending_review', 'approved', 'declined', 'needs_info', 'escalated']),
  created_at: z.string(),
  updated_at: z.string(),
  sla_due_at: z.string(),
  applicant: z.object({
    first_name: z.string(),
    last_name: z.string(),
    dob: z.string(),
    ssn_last4: z.string().nullable(),
    email: z.string(),
    phone: z.string(),
    nationality: z.string(),
    address: z.object({
      line1: z.string(),
      city: z.string(),
      region: z.string(),
      postal_code: z.string(),
      country: z.string(),
    }),
  }),
  document: z.object({
    type: z.enum(['passport', 'drivers_license', 'national_id']),
    number: z.string(),
    issuing_country: z.string(),
    status: z.enum(['passed', 'failed', 'needs_review']),
  }),
  selfie: z.object({ status: z.string(), match_score: z.number() }),
  watchlist: z.object({
    status: z.enum(['clear', 'hit']),
    hits: z.array(
      z.object({
        list: z.enum(['OFAC SDN', 'PEP', 'Adverse Media']),
        matched_name: z.string(),
        score: z.number(),
      }),
    ),
  }),
  device: z.object({
    ip_country: z.string(),
    vpn: z.boolean(),
    risk: z.enum(['low', 'medium', 'high']),
  }),
  risk_score: z.number(),
  risk_level: z.enum(['low', 'medium', 'high']),
  assignee: z.string().nullable(),
  decision: z
    .object({
      outcome: z.string(),
      reason_code: z.string().nullable(),
      note: z.string().nullable(),
      decided_by: z.string(),
      decided_at: z.string(),
    })
    .nullable(),
  notes: z.array(kycNoteSchema),
});

const caseListSchema = z.object({
  object: z.literal('list'),
  data: z.array(kycCaseSchema),
  has_more: z.boolean(),
});

export type KycCase = z.output<typeof kycCaseSchema>;
export type MaskedKycCase = KycCase & { pii_masked: true };
export type KycCaseStatus = KycCase['status'];

export type PiiField =
  | 'dob'
  | 'ssn_last4'
  | 'document_number'
  | 'address_line1'
  | 'postal_code'
  | 'email'
  | 'phone';

const maskEmail = (e: string) => `${e[0]}•••@${e.split('@')[1]}`;
const maskPhone = (p: string) => `•••-•••-${p.slice(-4)}`;
const maskDocumentNumber = (n: string) => '•'.repeat(Math.max(0, n.length - 2)) + n.slice(-2);

export function maskCase(c: KycCase): MaskedKycCase {
  return {
    ...c,
    applicant: {
      ...c.applicant,
      dob: '••••-••-••',
      ssn_last4: c.applicant.ssn_last4 === null ? null : '••••',
      email: maskEmail(c.applicant.email),
      phone: maskPhone(c.applicant.phone),
      address: { ...c.applicant.address, line1: '••••••', postal_code: '•••••' },
    },
    document: { ...c.document, number: maskDocumentNumber(c.document.number) },
    pii_masked: true,
  };
}

function piiValue(c: KycCase, field: PiiField): string | null {
  switch (field) {
    case 'document_number':
      return c.document.number;
    case 'address_line1':
      return c.applicant.address.line1;
    case 'postal_code':
      return c.applicant.address.postal_code;
    default:
      return c.applicant[field];
  }
}

export function createKycConnector(request: RequestFn) {
  return {
    read: {
      async listCases({ status, risk, assignee, limit, startingAfter }: {
        status?: KycCaseStatus;
        risk?: 'low' | 'medium' | 'high';
        assignee?: string;
        limit?: number;
        startingAfter?: string;
      } = {}) {
        const { data } = await request('GET', '/v1/cases', {
          query: { status, risk, assignee, limit, starting_after: startingAfter },
          schema: caseListSchema,
        });
        return { data: data.data.map(maskCase), hasMore: data.has_more };
      },
      async getCase(id: string): Promise<MaskedKycCase> {
        const { data } = await request('GET', `/v1/cases/${id}`, { schema: kycCaseSchema });
        return maskCase(data);
      },
    },
    pii: {
      async getPii(caseId: string, field: PiiField): Promise<string | null> {
        const { data } = await request('GET', `/v1/cases/${caseId}`, { schema: kycCaseSchema });
        return piiValue(data, field);
      },
    },
    decide: {
      async decide(caseId: string, { outcome, reasonCode, note, reviewer, idempotencyKey }: {
        outcome: 'approve' | 'decline' | 'request_info' | 'escalate';
        reasonCode?: string;
        note?: string;
        reviewer: string;
        idempotencyKey: string;
      }): Promise<MaskedKycCase> {
        const { data } = await request('POST', `/v1/cases/${caseId}/decision`, {
          body: { outcome, reason_code: reasonCode, note, reviewer },
          idempotencyKey,
          schema: kycCaseSchema,
        });
        return maskCase(data);
      },
      async assign(caseId: string, { assignee, idempotencyKey }: { assignee: string; idempotencyKey: string }) {
        const { data } = await request('POST', `/v1/cases/${caseId}/assign`, {
          body: { assignee },
          idempotencyKey,
          schema: kycCaseSchema,
        });
        return maskCase(data);
      },
      async addNote(caseId: string, { author, body, idempotencyKey }: { author: string; body: string; idempotencyKey: string }) {
        const { data } = await request('POST', `/v1/cases/${caseId}/notes`, {
          body: { author, body },
          idempotencyKey,
          schema: kycCaseSchema,
        });
        return maskCase(data);
      },
    },
  };
}

export type KycConnector = ReturnType<typeof createKycConnector>;
