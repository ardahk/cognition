import { defineModule } from '@/platform/define';

export default defineModule({
  id: 'refunds',
  name: 'Refunds',
  description:
    'Support dashboard to find payments and issue full or partial refunds with ledger postings, with ops lead approval for refunds over $250.',
  owner: '@ardahk',
  risk: 'critical',
  connectors: { payments: ['read', 'refund'], ledger: ['read', 'post'] },
  permissions: ['refunds.view', 'refunds.refund', 'refunds.approve'],
  viewPermission: 'refunds.view',
  nav: { icon: 'Undo2' },
});
