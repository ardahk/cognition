import { defineModule } from '@/platform/define';

export default defineModule({
  id: 'kyc-review',
  name: 'KYC Review',
  description: 'Queue for KYC analysts to review, decide, and escalate identity verification cases, with compliance sign-off on high-risk approvals.',
  owner: '@ardahk',
  risk: 'critical',
  connectors: { kyc: ['read', 'pii', 'decide'] },
  permissions: [
    'kyc-review.view',
    'kyc-review.assign',
    'kyc-review.note',
    'kyc-review.decide',
    'kyc-review.reveal',
    'kyc-review.signoff',
  ],
  viewPermission: 'kyc-review.view',
  nav: { icon: 'ShieldCheck' },
});
