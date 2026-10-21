import { defineAccess } from '@/platform/define';
import manifest from './manifest';

export default defineAccess(manifest, {
  engineer: ['feature-flags.view', 'feature-flags.edit'],
  oncall: ['feature-flags.view', 'feature-flags.kill'],
  eng_lead: ['feature-flags.view', 'feature-flags.approve'],
});
