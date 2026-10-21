export const ROLES = [
  'support_agent',
  'ops_lead',
  'kyc_analyst',
  'compliance_officer',
  'engineer',
  'oncall',
  'eng_lead',
  'platform_admin',
] as const;
export type Role = (typeof ROLES)[number];

export const IDP_GROUP_ROLES: Record<string, Role> = {
  'okta:support': 'support_agent',
  'okta:ops-leads': 'ops_lead',
  'okta:kyc-analysts': 'kyc_analyst',
  'okta:compliance': 'compliance_officer',
  'okta:engineering': 'engineer',
  'okta:oncall': 'oncall',
  'okta:eng-leads': 'eng_lead',
  'okta:platform-admins': 'platform_admin',
};

export function rolesForGroups(groups: readonly string[]): Role[] {
  return [...new Set(groups.map((g) => IDP_GROUP_ROLES[g]).filter((r): r is Role => !!r))];
}
