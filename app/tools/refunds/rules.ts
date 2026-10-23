export const APPROVAL_THRESHOLD = 25_000;
export const NOTE_MAX = 280;

export const REFUND_REASONS = [
  'requested_by_customer',
  'duplicate',
  'fraudulent',
  'product_not_received',
  'other',
] as const;

export function needsApproval(alreadyRefunded: number, amount: number) {
  return alreadyRefunded + amount > APPROVAL_THRESHOLD;
}

export function maskEmail(email: string) {
  const at = email.indexOf('@');
  return at > 0 ? `${email[0]}•••${email.slice(at)}` : '•••';
}

export function startOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function summarizeRefunds(refunds: readonly { amount: number; reason: string }[]) {
  const byReason = new Map<string, number>();
  let total = 0;
  for (const r of refunds) {
    total += r.amount;
    byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + r.amount);
  }
  return {
    count: refunds.length,
    total,
    byReason: [...byReason].map(([reason, amount]) => ({ reason, amount })).sort((a, b) => b.amount - a.amount),
  };
}
