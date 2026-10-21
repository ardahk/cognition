import { defineAccess } from '@/platform/define';
import manifest from './manifest';

export default defineAccess(manifest, {
  support_agent: ['refunds.view', 'refunds.refund'],
  ops_lead: ['refunds.view', 'refunds.refund', 'refunds.approve'],
  compliance_officer: ['refunds.view'],
});
