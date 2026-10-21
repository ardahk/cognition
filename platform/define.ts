import { z } from 'zod';
import { RISKS, type ConnectorScopes, type Risk } from './connectors/scopes';
import type { Role } from './auth/roles';

export const manifestSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1),
    description: z.string().min(1),
    owner: z.string().startsWith('@'),
    risk: z.enum(RISKS),
    connectors: z.strictObject({
      payments: z.array(z.enum(['read', 'refund'])).optional(),
      kyc: z.array(z.enum(['read', 'pii', 'decide'])).optional(),
      ledger: z.array(z.enum(['read', 'post'])).optional(),
      flags: z.array(z.enum(['read', 'write'])).optional(),
    }),
    permissions: z.array(z.string().min(1)).nonempty(),
    viewPermission: z.string().min(1),
    nav: z.object({ icon: z.string(), order: z.number().optional() }),
  })
  .superRefine((m, ctx) => {
    for (const p of m.permissions) {
      if (!p.startsWith(`${m.id}.`)) {
        ctx.addIssue({ code: 'custom', path: ['permissions'], message: `permission "${p}" must start with "${m.id}."` });
      }
    }
    if (!m.permissions.includes(m.viewPermission)) {
      ctx.addIssue({ code: 'custom', path: ['viewPermission'], message: 'viewPermission must be one of permissions' });
    }
  });

export interface ModuleManifest {
  id: string;
  name: string;
  description: string;
  owner: string;
  risk: Risk;
  connectors: ConnectorScopes;
  permissions: readonly string[];
  viewPermission: string;
  nav: { icon: string; order?: number };
}

export function defineModule<const M extends ModuleManifest>(manifest: M): M {
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new Error(`Invalid manifest ${manifest.id}: ${z.prettifyError(parsed.error)}`);
  }
  return manifest;
}

export type PermissionOf<M extends ModuleManifest> = M['permissions'][number];

export interface ModuleAccess {
  module: string;
  grants: Partial<Record<Role, readonly string[]>>;
}

export function defineAccess<M extends ModuleManifest>(
  manifest: M,
  grants: Partial<Record<Role, readonly PermissionOf<M>[]>>,
): ModuleAccess {
  return { module: manifest.id, grants };
}

export type RegisteredModule = { manifest: ModuleManifest; access: ModuleAccess };
export type { Risk };
