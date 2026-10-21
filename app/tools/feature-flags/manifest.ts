import { defineModule } from '@/platform/define';

export default defineModule({
  id: 'feature-flags',
  name: 'Feature Flags',
  description:
    'Engineering admin panel for feature flags: view and change flag state per environment, with eng lead approval for production and an on-call kill switch.',
  owner: '@ardahk',
  risk: 'critical',
  connectors: { flags: ['read', 'write'] },
  permissions: [
    'feature-flags.view',
    'feature-flags.edit',
    'feature-flags.kill',
    'feature-flags.approve',
  ],
  viewPermission: 'feature-flags.view',
  nav: { icon: 'Flag' },
});
