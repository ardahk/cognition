import { defineAccess, defineModule } from '@/platform/define';

export const manifest = defineModule({
  id: 'test-refunds',
  name: 'Test Refunds',
  description: 'Fixture module for platform tests',
  owner: '@platform',
  risk: 'critical',
  connectors: { payments: ['read', 'refund'], ledger: ['read', 'post'] },
  permissions: ['test-refunds.view', 'test-refunds.refund', 'test-refunds.approve'],
  viewPermission: 'test-refunds.view',
  nav: { icon: 'receipt' },
});

// Same module id, but scoped to payments:read only — for the scope-overreach test.
export const overreachManifest = defineModule({
  ...manifest,
  connectors: { payments: ['read'] },
});

export const access = defineAccess(manifest, {
  support_agent: ['test-refunds.view', 'test-refunds.refund'],
  ops_lead: ['test-refunds.view', 'test-refunds.refund', 'test-refunds.approve'],
});
