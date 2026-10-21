import { defineAccess } from '@/platform/define';
import manifest from './manifest';

export default defineAccess(manifest, {
  kyc_analyst: ['kyc-review.view', 'kyc-review.assign', 'kyc-review.note', 'kyc-review.decide'],
  compliance_officer: ['kyc-review.view', 'kyc-review.note', 'kyc-review.reveal', 'kyc-review.signoff'],
});
