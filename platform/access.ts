import { modules } from './registry.generated';
import type { ModuleManifest, RegisteredModule } from './define';
import type { Role } from './auth/roles';

export const PLATFORM_GRANTS: Partial<Record<Role, string[]>> = {
  compliance_officer: ['platform.audit.view', 'platform.admin.view'],
  eng_lead: ['platform.audit.view', 'platform.admin.view'],
  platform_admin: ['platform.audit.view', 'platform.admin.view'],
};

export function permissionsFor(
  roles: Role[],
  registered: RegisteredModule[] = modules,
): ReadonlySet<string> {
  const permissions = new Set<string>();
  for (const role of roles) {
    for (const p of PLATFORM_GRANTS[role] ?? []) permissions.add(p);
    for (const mod of registered) {
      for (const p of mod.access.grants[role] ?? []) permissions.add(p);
    }
  }
  return permissions;
}

export function visibleModules(
  permissions: ReadonlySet<string>,
  registered: RegisteredModule[] = modules,
): ModuleManifest[] {
  return registered
    .filter((m) => permissions.has(m.manifest.viewPermission))
    .map((m) => m.manifest)
    .sort((a, b) => (a.nav.order ?? 0) - (b.nav.order ?? 0) || a.name.localeCompare(b.name));
}

export function rolesWithPermission(
  permission: string,
  registered: RegisteredModule[] = modules,
): Role[] {
  const roles = new Set<Role>();
  for (const [role, grants] of Object.entries(PLATFORM_GRANTS)) {
    if (grants?.includes(permission)) roles.add(role as Role);
  }
  for (const mod of registered) {
    for (const [role, grants] of Object.entries(mod.access.grants)) {
      if (grants?.includes(permission)) roles.add(role as Role);
    }
  }
  return [...roles];
}
