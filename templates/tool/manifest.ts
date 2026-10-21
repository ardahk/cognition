import { defineModule } from '@/platform/define';

export default defineModule({
  id: '__TOOL_ID__',
  name: '__TOOL_NAME__',
  description: 'TODO: one sentence on what this tool does and who uses it.',
  owner: '@ardahk',
  risk: 'low',
  connectors: {},
  permissions: ['__TOOL_ID__.view'],
  viewPermission: '__TOOL_ID__.view',
  nav: { icon: 'Wrench' },
});
