import type { Db } from '@/platform/db/client';
import {
  flags,
  kycCases,
  kycNotes,
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  payments,
  refunds,
} from './schema';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MERCHANTS = [
  'Bluebird Coffee',
  'Northside Fitness',
  'Atlas Outdoor Co.',
  'Lumen Books',
  'Harbor Health Clinic',
  'Pixel Forge Games',
  'Greenleaf Grocers',
  'Orbit Electronics',
  'Cedar & Sage Spa',
  'Quill Stationery',
].map((name, i) => ({ id: `mer_${String(i + 1).padStart(3, '0')}`, name }));

const FIRST_NAMES = [
  'Aisha', 'Mateo', 'Ingrid', 'Kwame', 'Yuki', 'Priya', 'Liam', 'Fatima', 'Diego', 'Nadia',
  'Elena', 'Marcus', 'Sofia', 'Tunde', 'Mei', 'Oscar', 'Zara', 'Felix', 'Amara', 'Jonas',
  'Leila', 'Ravi', 'Clara', 'Dmitri', 'Hana', 'Victor', 'Noor', 'Theo', 'Chiara', 'Emeka',
];
const LAST_NAMES = [
  'Okafor', 'Garcia', 'Lindqvist', 'Mensah', 'Tanaka', 'Sharma', 'O\'Brien', 'Haddad', 'Silva', 'Petrova',
  'Kowalski', 'Nguyen', 'Rossi', 'Adeyemi', 'Chen', 'Mueller', 'Ali', 'Dubois', 'Santos', 'Novak',
  'Costa', 'Iyer', 'Larsen', 'Volkov', 'Sato', 'Moreau', 'Aziz', 'Berg', 'Romano', 'Eze',
];
const EMAIL_TLDS = ['example.com', 'example.org', 'example.net'];
const BRANDS = ['visa', 'mastercard', 'amex'];
const DESCRIPTIONS = [
  'Monthly subscription', 'One-time purchase', 'Annual membership', 'Service invoice',
  'Product order', 'Booking deposit', 'Class pack', null,
];
const COUNTRIES = ['US', 'GB', 'DE', 'FR', 'NG', 'BR', 'IN', 'MX', 'PH', 'CA'];
const CITIES: Record<string, [string, string, string][]> = {
  US: [['Austin', 'TX', '78701'], ['Portland', 'OR', '97205'], ['Chicago', 'IL', '60607']],
  GB: [['London', 'England', 'E1 6AN'], ['Manchester', 'England', 'M1 1AE']],
  DE: [['Berlin', 'BE', '10115'], ['Munich', 'BY', '80331']],
  FR: [['Paris', 'IDF', '75011'], ['Lyon', 'ARA', '69002']],
  NG: [['Lagos', 'LA', '100001'], ['Abuja', 'FC', '900001']],
  BR: [['São Paulo', 'SP', '01310-100'], ['Rio de Janeiro', 'RJ', '20040-020']],
  IN: [['Bengaluru', 'KA', '560001'], ['Mumbai', 'MH', '400001']],
  MX: [['Mexico City', 'CDMX', '06600'], ['Guadalajara', 'JAL', '44100']],
  PH: [['Manila', 'NCR', '1000'], ['Cebu City', 'Cebu', '6000']],
  CA: [['Toronto', 'ON', 'M5V 1J1'], ['Vancouver', 'BC', 'V6B 1A1']],
};
const STREETS = ['Maple St', 'Oak Ave', 'Cedar Rd', 'Elm Dr', 'Birch Ln', 'Willow Way'];
const ANALYSTS = ['sam@fernpay.test', 'morgan@fernpay.test', 'review@fernpay.test', null];
const FLAG_DEFS: { key: string; name: string; description: string; owner: string; tags: string[] }[] = [
  { key: 'instant-payouts', name: 'Instant payouts', description: 'Enable instant payouts for eligible merchants', owner: '@team-payouts', tags: ['payouts'] },
  { key: 'new-checkout-flow', name: 'New checkout flow', description: 'Redesigned hosted checkout', owner: '@team-checkout', tags: ['checkout', 'web'] },
  { key: 'kyc-auto-approve-low-risk', name: 'KYC auto-approve low risk', description: 'Auto-approve KYC cases below the risk threshold', owner: '@team-kyc', tags: ['kyc', 'automation'] },
  { key: 'refund-self-serve', name: 'Refund self-serve', description: 'Let merchants issue refunds from the dashboard', owner: '@team-payments', tags: ['payments', 'refunds'] },
  { key: 'ledger-v2-writes', name: 'Ledger v2 writes', description: 'Route postings through the v2 ledger service', owner: '@team-ledger', tags: ['ledger'] },
  { key: '3ds-challenge-all', name: '3DS challenge all', description: 'Challenge every payment with 3D Secure', owner: '@team-risk', tags: ['payments', 'risk'] },
  { key: 'dispute-evidence-upload', name: 'Dispute evidence upload', description: 'Merchant evidence upload for disputes', owner: '@team-disputes', tags: ['disputes'] },
  { key: 'merchant-dashboard-v2', name: 'Merchant dashboard v2', description: 'New merchant dashboard UI', owner: '@team-web', tags: ['web', 'dashboard'] },
  { key: 'fx-multi-currency', name: 'FX multi-currency', description: 'Settle merchants in local currency', owner: '@team-payments', tags: ['payments', 'fx'] },
  { key: 'card-issuing-beta', name: 'Card issuing beta', description: 'Issue virtual cards to merchants', owner: '@team-issuing', tags: ['issuing', 'beta'] },
  { key: 'payout-holds-high-risk', name: 'Payout holds for high risk', description: 'Hold payouts for high-risk merchants', owner: '@team-risk', tags: ['payouts', 'risk'] },
  { key: 'webhook-retries-v2', name: 'Webhook retries v2', description: 'New exponential retry policy for webhooks', owner: '@team-platform', tags: ['webhooks'] },
  { key: 'sanctions-rescreening-daily', name: 'Daily sanctions rescreening', description: 'Rescreen all customers against sanctions lists daily', owner: '@team-compliance', tags: ['kyc', 'compliance'] },
  { key: 'smart-retry-failed-payments', name: 'Smart retry failed payments', description: 'Retry failed payments at issuer-optimal times', owner: '@team-payments', tags: ['payments', 'retry'] },
  { key: 'apple-pay-web', name: 'Apple Pay on web', description: 'Apple Pay payment method on web checkout', owner: '@team-checkout', tags: ['checkout', 'web', 'wallet'] },
];

export async function seedVendors(db: Db, now = new Date()) {
  const rand = mulberry32(20261020);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const iso = (d: Date) => d.toISOString();
  const pad = (n: number, w = 6) => String(n).padStart(w, '0');

  // --- Customers & payments ---
  const customers = Array.from({ length: 120 }, (_, i) => {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    return {
      id: `cus_${pad(i + 1)}`,
      email: `${first}.${last}${rand() < 0.3 ? int(1, 99) : ''}@${pick(EMAIL_TLDS)}`.toLowerCase(),
      name: `${first} ${last}`,
    };
  });

  const paymentRows = Array.from({ length: 300 }, (_, i) => {
    const created = now.getTime() - Math.floor(rand() * 30 * 24 * 3600) * 1000;
    const amount = 500 + Math.round(rand() ** 2.5 * 245000);
    return {
      id: `pay_${pad(i + 1)}`,
      amount,
      amountRefunded: 0,
      currency: 'usd',
      status: (rand() < 0.03 ? 'failed' : 'succeeded') as
        | 'failed'
        | 'succeeded'
        | 'partially_refunded'
        | 'refunded',
      customer: pick(customers),
      paymentMethod: { brand: pick(BRANDS), last4: pad(int(0, 9999), 4) },
      merchant: pick(MERCHANTS),
      description: pick(DESCRIPTIONS),
      created: Math.floor(created / 1000),
    };
  }).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));

  // --- Refunds: ~8% of succeeded, 2/3 full, 1/3 partial ---
  type RefundRow = typeof refunds.$inferInsert;
  const refundRows: RefundRow[] = [];
  const refundReasons = ['requested_by_customer', 'duplicate', 'product_not_received', 'other'] as const;
  let refundSeq = 0;
  for (const p of paymentRows) {
    if (p.status !== 'succeeded' || rand() >= 0.08) continue;
    const full = rand() < 2 / 3;
    const amount = full ? p.amount : Math.max(1, Math.round(p.amount * (0.1 + rand() * 0.5)));
    refundRows.push({
      id: `re_${pad(++refundSeq)}`,
      paymentId: p.id,
      amount,
      reason: pick(refundReasons),
      metadata: {},
      created:
        p.created +
        Math.floor(rand() * Math.max(0, Math.floor(now.getTime() / 1000) - p.created)),
    });
    p.amountRefunded = amount;
    p.status = amount >= p.amount ? 'refunded' : 'partially_refunded';
  }
  // ~5 refunds created today
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todaySecs = Math.floor(startOfToday.getTime() / 1000);
  const todaySpan = Math.max(1, Math.floor(now.getTime() / 1000) - todaySecs);
  for (const r of refundRows.slice(0, 5)) {
    r.created = todaySecs + Math.floor(rand() * todaySpan);
  }
  refundRows.sort((a, b) => a.created - b.created || a.id!.localeCompare(b.id!));

  // --- Ledger ---
  const accountRows = [
    { id: 'la_processor_receivable', key: 'processor_receivable', name: 'Processor receivable', normalBalance: 'debit' as const },
    { id: 'la_merchant_payables', key: 'merchant_payables', name: 'Merchant payables', normalBalance: 'credit' as const },
    { id: 'la_fee_revenue', key: 'fee_revenue', name: 'Fee revenue', normalBalance: 'credit' as const },
    { id: 'la_cash_operating', key: 'cash_operating', name: 'Operating cash', normalBalance: 'debit' as const },
  ];

  type TxRow = typeof ledgerTransactions.$inferInsert;
  type EntryRow = typeof ledgerEntries.$inferInsert;
  const txRows: TxRow[] = [];
  const entryRows: EntryRow[] = [];
  let txSeq = 0;
  let entrySeq = 0;
  const post = (
    externalId: string,
    description: string,
    effectiveAt: string,
    entries: [accountId: string, direction: 'debit' | 'credit', amount: number][],
  ) => {
    const txId = `ltx_${pad(++txSeq)}`;
    txRows.push({ id: txId, externalId, description, effectiveAt, createdAt: effectiveAt });
    for (const [ledgerAccountId, direction, amount] of entries) {
      entryRows.push({
        id: `le_${pad(++entrySeq)}`,
        transactionId: txId,
        ledgerAccountId,
        direction,
        amount,
      });
    }
  };

  const dayKey = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
  const dayNet = new Map<string, number>();

  for (const p of paymentRows) {
    if (p.status === 'failed') continue;
    const fee = Math.round(p.amount * 0.029) + 30;
    post(p.id, `Payment ${p.id} for ${p.merchant.name}`, new Date(p.created * 1000).toISOString(), [
      ['la_processor_receivable', 'debit', p.amount],
      ['la_merchant_payables', 'credit', p.amount - fee],
      ['la_fee_revenue', 'credit', fee],
    ]);
    dayNet.set(dayKey(p.created), (dayNet.get(dayKey(p.created)) ?? 0) + p.amount);
  }
  for (const r of refundRows) {
    post(r.id!, `Refund ${r.id} for ${r.paymentId}`, new Date(r.created! * 1000).toISOString(), [
      ['la_merchant_payables', 'debit', r.amount!],
      ['la_processor_receivable', 'credit', r.amount!],
    ]);
    dayNet.set(dayKey(r.created!), (dayNet.get(dayKey(r.created!)) ?? 0) - r.amount!);
  }
  // Daily settlements for days older than 2
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 2);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  for (const [day, net] of [...dayNet.entries()].sort()) {
    if (day >= cutoffKey || net <= 0) continue;
    post(`stl_${day.replaceAll('-', '')}`, `Settlement for ${day}`, `${day}T23:59:59.000Z`, [
      ['la_cash_operating', 'debit', net],
      ['la_processor_receivable', 'credit', net],
    ]);
  }

  // --- KYC cases ---
  type CaseRow = typeof kycCases.$inferInsert;
  const caseRows: CaseRow[] = [];
  const noteRows: (typeof kycNotes.$inferInsert)[] = [];
  let noteSeq = 0;
  const riskLevel = (score: number) => (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low');
  const watchlistLists = ['OFAC SDN', 'PEP', 'Adverse Media'] as const;

  for (let i = 0; i < 60; i++) {
    const pending = i < 40;
    const status = (
      i < 40 ? 'pending_review' : i < 48 ? 'approved' : i < 53 ? 'declined' : i < 57 ? 'needs_info' : 'escalated'
    ) as typeof kycCases.$inferInsert.status;
    const ageMs = pending
      ? rand() * 72 * 3600 * 1000
      : (3 + rand() * 7) * 24 * 3600 * 1000;
    const createdAt = new Date(now.getTime() - ageMs);
    // 12 of the pending cases are high-risk; 8 watchlist hits, mostly high-risk
    const watchlistHit = i < 6 || i === 20 || i === 21;
    const highRisk = pending && i < 12;
    const score = highRisk || (watchlistHit && rand() < 0.7) ? int(70, 96) : int(0, 69);
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const country = pick(COUNTRIES);
    const [city, region, postal] = pick(CITIES[country]);
    const deviceMismatch = rand() < 0.2;
    const decided = status !== 'pending_review';
    const decidedAt = decided ? new Date(createdAt.getTime() + rand() * 48 * 3600 * 1000) : null;
    const outcomeByStatus = {
      approved: 'approve',
      declined: 'decline',
      needs_info: 'request_info',
      escalated: 'escalate',
    } as const;
    caseRows.push({
      id: `kyc_${pad(i + 1)}`,
      status,
      createdAt: iso(createdAt),
      updatedAt: iso(decidedAt ?? createdAt),
      slaDueAt: iso(new Date(createdAt.getTime() + 24 * 3600 * 1000)),
      applicant: {
        first_name: first,
        last_name: last,
        dob: `${int(1958, 2002)}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`,
        ssn_last4: country === 'US' ? pad(int(0, 9999), 4) : null,
        email: `${first}.${last}@${pick(EMAIL_TLDS)}`.toLowerCase(),
        phone: `+${int(1, 55)}${pad(int(100000000, 999999999), 9)}`,
        nationality: country,
        address: {
          line1: `${int(1, 999)} ${pick(STREETS)}`,
          city,
          region,
          postal_code: postal,
          country,
        },
      },
      document: {
        type: pick(['passport', 'drivers_license', 'national_id'] as const),
        number: `${pick(['P', 'D', 'N'])}${pad(int(10000000, 99999999), 8)}`,
        issuing_country: country,
        status: score >= 70 ? pick(['failed', 'needs_review'] as const) : 'passed',
      },
      selfie: {
        status: score >= 70 ? 'needs_review' : 'passed',
        match_score: score >= 70 ? int(30, 65) : int(70, 99),
      },
      watchlist: watchlistHit
        ? {
            status: 'hit',
            hits: [
              { list: pick(watchlistLists), matched_name: `${first} ${last}`, score: int(70, 99) },
            ],
          }
        : { status: 'clear', hits: [] },
      device: {
        ip_country: deviceMismatch ? pick(COUNTRIES.filter((c) => c !== country)) : country,
        vpn: deviceMismatch && rand() < 0.5,
        risk: deviceMismatch ? pick(['medium', 'high'] as const) : 'low',
      },
      riskScore: score,
      riskLevel: riskLevel(score),
      assignee: pending && rand() < 0.5 ? pick(ANALYSTS.filter(Boolean)) : pick(ANALYSTS),
      decision: decided
        ? {
            outcome: outcomeByStatus[status as keyof typeof outcomeByStatus],
            reason_code:
              status === 'declined' ? pick(['watchlist_hit', 'document_mismatch', 'sanctions']) : null,
            note: decided && rand() < 0.4 ? 'Reviewed per policy v3' : null,
            decided_by: 'morgan@fernpay.test',
            decided_at: iso(decidedAt!),
          }
        : null,
    });
    if (rand() < 0.25) {
      noteRows.push({
        id: `note_${pad(++noteSeq)}`,
        caseId: `kyc_${pad(i + 1)}`,
        author: pick(ANALYSTS.filter(Boolean) as string[]),
        body: pick([
          'Requested additional documents from applicant',
          'Watchlist match needs manual review',
          'Document image quality is poor, resubmission likely',
          'Verified address against utility bill',
        ]),
        createdAt: iso(createdAt),
      });
    }
  }

  // --- Flags ---
  const flagRows = FLAG_DEFS.map((f) => {
    const devOn = rand() < 0.85;
    const stagingOn = rand() < 0.6;
    const prodState = rand();
    return {
      key: f.key,
      name: f.name,
      description: f.description,
      owner: f.owner,
      tags: f.tags,
      environments: {
        development: { enabled: devOn, rollout_percentage: devOn ? 100 : 0 },
        staging: { enabled: stagingOn, rollout_percentage: stagingOn ? pick([25, 50, 100]) : 0 },
        production: {
          enabled: prodState < 0.4,
          rollout_percentage: prodState < 0.4 ? pick([5, 10, 25, 50]) : 0,
        },
      },
      version: int(1, 14),
      updatedAt: iso(new Date(now.getTime() - rand() * 20 * 24 * 3600 * 1000)),
      updatedBy: pick(['taylor@fernpay.test', 'jordan@fernpay.test', 'release-bot@fernpay.test']),
    };
  });

  await db.insert(flags).values(flagRows);
  await db.insert(ledgerAccounts).values(accountRows);
  await db.insert(payments).values(paymentRows);
  await db.insert(refunds).values(refundRows);
  await db.insert(ledgerTransactions).values(txRows);
  await db.insert(ledgerEntries).values(entryRows);
  await db.insert(kycCases).values(caseRows);
  if (noteRows.length) await db.insert(kycNotes).values(noteRows);
}
