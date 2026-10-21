export const HIGH_RISK_SCORE = 70;
export const SLA_HOURS = 24;

export const STATUSES = ['pending_review', 'needs_info', 'escalated', 'approved', 'declined'] as const;
export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export const FINAL_STATUSES: readonly string[] = ['approved', 'declined'];

export const DECLINE_REASONS = [
  'watchlist_hit',
  'sanctions',
  'document_mismatch',
  'selfie_mismatch',
  'suspected_fraud',
  'other',
] as const;

type SignoffInputs = {
  risk_score: number;
  watchlist: { status: string; hits: readonly unknown[] };
};

export function needsSignoff(c: SignoffInputs) {
  return c.risk_score >= HIGH_RISK_SCORE || c.watchlist.status === 'hit' || c.watchlist.hits.length > 0;
}

export function isOverdue(slaDueAt: string, now = Date.now()) {
  return new Date(slaDueAt).getTime() < now;
}

export const PII_FIELDS = ['dob', 'ssn_last4', 'document_number', 'address_line1', 'postal_code', 'email', 'phone'] as const;
export type PiiField = (typeof PII_FIELDS)[number];
