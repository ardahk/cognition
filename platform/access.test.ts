import { describe, expect, it, vi } from 'vitest';

vi.mock('@/platform/registry.generated', async () => {
  const { manifest, access } = await import('@/tests/fixtures/test-module');
  return { modules: [{ manifest, access }] };
});

import { permissionsFor, rolesWithPermission, visibleModules } from '@/platform/access';

describe('access', () => {
  it('support_agent gets view + refund but not approve', () => {
    const perms = permissionsFor(['support_agent']);
    expect(perms.has('test-refunds.view')).toBe(true);
    expect(perms.has('test-refunds.refund')).toBe(true);
    expect(perms.has('test-refunds.approve')).toBe(false);
  });

  it('compliance_officer gets the platform grants', () => {
    const perms = permissionsFor(['compliance_officer']);
    expect(perms.has('platform.audit.view')).toBe(true);
    expect(perms.has('platform.admin.view')).toBe(true);
    expect(perms.has('test-refunds.view')).toBe(false);
  });

  it('visibleModules filters by viewPermission', () => {
    expect(visibleModules(permissionsFor(['support_agent'])).map((m) => m.id)).toEqual([
      'test-refunds',
    ]);
    expect(visibleModules(permissionsFor(['kyc_analyst']))).toEqual([]);
  });

  it('rolesWithPermission finds granting roles', () => {
    expect(rolesWithPermission('test-refunds.approve')).toEqual(['ops_lead']);
    expect(rolesWithPermission('platform.audit.view').sort()).toEqual([
      'compliance_officer',
      'eng_lead',
      'platform_admin',
    ]);
  });
});
