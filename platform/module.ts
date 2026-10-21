import 'server-only';
import { randomUUID } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { getSession, type SessionUser } from './auth/session';
import type { Role } from './auth/roles';
import { auditTrail, writeAudit } from './audit';
import { createApprovalRequest, pendingForModule } from './approvals/store';
import {
  createConnectors,
  scopeConnectors,
  VendorError,
  type ScopedConnectors,
} from './connectors';
import { db, type Db } from './db/client';
import { approvalRequests } from './db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { ModuleManifest, PermissionOf } from './define';

export const ACTION_META = Symbol.for('toolyard.action');

type ApprovalRule<M extends ModuleManifest> = {
  permission: PermissionOf<M>;
  reason: string;
  mode?: 'pre' | 'post-hoc';
};

export type ActionSpec<M extends ModuleManifest, I extends z.ZodType, O> = {
  name: string; // audit action = `${manifest.id}.${name}`
  permission: PermissionOf<M>;
  input: I;
  target?: (input: z.output<I>) => { type: string; id: string };
  approval?: (
    input: z.output<I>,
    ctx: { user: SessionUser; roles: Role[] },
  ) => ApprovalRule<M> | null;
  auditRedact?: (keyof z.output<I>)[];
  handler: (args: { input: z.output<I>; ctx: ActionContext<M> }) => Promise<O>;
};

export type ActionContext<M extends ModuleManifest> = {
  user: SessionUser;
  roles: Role[];
  idempotencyKey: string;
  connectors: ScopedConnectors<M['connectors']>;
  db: Db;
  record(partial: Record<string, unknown>): void;
  approvedBy?: SessionUser;
};

export type ActionResult<O> =
  | { ok: true; status: 'succeeded'; data: O; attemptId: string; reviewId?: string }
  | { ok: true; status: 'pending_approval'; approvalId: string }
  | {
      ok: false;
      error: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'FAILED';
      message: string;
      issues?: Record<string, string[]>;
    };

export type ActionMeta<M extends ModuleManifest = ModuleManifest> = {
  module: M;
  name: string;
  spec: ActionSpec<M, z.ZodType, unknown>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function actorFields(user: SessionUser, roles: Role[]) {
  return {
    actorId: user.id,
    actorEmail: user.email,
    actorName: user.name,
    actorRoles: roles,
  };
}

function redactInput(input: unknown, keys: readonly (string | number | symbol)[] | undefined) {
  const out = { ...(input as Record<string, unknown>) };
  for (const k of keys ?? []) out[k as string] = '[redacted]';
  return out;
}

function errorMessage(e: unknown): string {
  if (e instanceof VendorError) return `[${e.vendor} ${e.status} ${e.type}] ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

export async function execute<M extends ModuleManifest>(
  meta: ActionMeta<M>,
  input: unknown,
  run: {
    actor: SessionUser;
    roles: Role[];
    idempotencyKey: string;
    approvalId?: string;
    approvedBy?: SessionUser;
  },
): Promise<
  | { ok: true; data: unknown; attemptId: string }
  | { ok: false; error: 'FAILED'; message: string; attemptId: string }
> {
  const { module: manifest, name, spec } = meta;
  const attemptId = randomUUID();
  const target = spec.target?.(input);
  const redacted = redactInput(input, spec.auditRedact);
  const base = {
    ...actorFields(run.actor, run.roles),
    module: manifest.id,
    action: `${manifest.id}.${name}`,
    attemptId,
    idempotencyKey: run.idempotencyKey,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    approvalId: run.approvalId ?? null,
    approvedBy: run.approvedBy?.email ?? null,
    input: redacted,
  };

  // Write-ahead: a committed single insert before any connector call.
  await writeAudit({ ...base, status: 'attempted' });

  const recorded: Record<string, unknown> = {};
  const ctx: ActionContext<M> = {
    user: run.actor,
    roles: run.roles,
    idempotencyKey: run.idempotencyKey,
    connectors: scopeConnectors(createConnectors(), manifest.connectors),
    db,
    record: (partial) => Object.assign(recorded, partial),
    approvedBy: run.approvedBy,
  };
  try {
    const data = await spec.handler({ input, ctx } as never);
    const result =
      typeof data === 'object' && data !== null && !Array.isArray(data)
        ? { ...recorded, ...(data as Record<string, unknown>) }
        : { ...recorded, value: data };
    await writeAudit({ ...base, status: 'succeeded', result });
    return { ok: true, data, attemptId };
  } catch (e) {
    const message = errorMessage(e);
    await writeAudit({
      ...base,
      status: 'failed',
      error: message,
      result: Object.keys(recorded).length ? recorded : null,
    });
    return { ok: false, error: 'FAILED', message, attemptId };
  }
}

export function defineAction<M extends ModuleManifest, I extends z.ZodType, O>(
  manifest: M,
  spec: ActionSpec<M, I, O>,
): ((raw: unknown) => Promise<ActionResult<O>>) & { [ACTION_META]: ActionMeta<M> } {
  const meta: ActionMeta<M> = { module: manifest, name: spec.name, spec: spec as never };
  const fn = async (raw: unknown): Promise<ActionResult<O>> => {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: 'UNAUTHENTICATED', message: 'Not signed in' };
    }
    const { user, roles } = session;
    const action = `${manifest.id}.${spec.name}`;
    if (!session.permissions.has(spec.permission)) {
      await writeAudit({
        status: 'denied',
        module: manifest.id,
        action,
        ...actorFields(user, roles),
      });
      return {
        ok: false,
        error: 'FORBIDDEN',
        message: `Missing permission ${spec.permission}`,
      };
    }

    const obj =
      raw instanceof FormData
        ? Object.fromEntries(raw)
        : ((raw ?? {}) as Record<string, unknown>);
    const { idempotencyKey: rawKey, ...rest } = obj;
    const parsed = spec.input.safeParse(rest);
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error);
      return {
        ok: false,
        error: 'INVALID_INPUT',
        message: 'Invalid input',
        issues: Object.fromEntries(
          Object.entries(fieldErrors).filter((e): e is [string, string[]] => !!e[1]),
        ),
      };
    }
    const input = parsed.data;
    const idempotencyKey =
      typeof rawKey === 'string' && UUID_RE.test(rawKey) ? rawKey : randomUUID();
    const target = spec.target?.(input);
    const rule = spec.approval?.(input, { user, roles }) ?? null;

    const requestFields = {
      module: manifest.id,
      action: spec.name,
      input,
      idempotencyKey,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
      requestedById: user.id,
      requestedByEmail: user.email,
      requestedByName: user.name,
      requestedByRoles: roles,
    };

    if (rule && (rule.mode ?? 'pre') === 'pre') {
      const { request, created } = await createApprovalRequest({
        ...requestFields,
        mode: 'pre',
        status: 'pending',
        reason: rule.reason,
        approverPermission: rule.permission,
      });
      if (created) {
        await writeAudit({
          status: 'pending_approval',
          module: manifest.id,
          action,
          approvalId: request.id,
          idempotencyKey,
          targetType: target?.type ?? null,
          targetId: target?.id ?? null,
          input: redactInput(input, spec.auditRedact),
          ...actorFields(user, roles),
        });
      }
      return { ok: true, status: 'pending_approval', approvalId: request.id };
    }

    // post-hoc: the request must exist before the outcome audit row so it can carry approval_id
    let reviewId: string | undefined;
    if (rule?.mode === 'post-hoc') {
      const { request } = await createApprovalRequest({
        ...requestFields,
        mode: 'post-hoc',
        status: 'pending_review',
        reason: rule.reason,
        approverPermission: rule.permission,
      });
      reviewId = request.id;
    }

    const result = await execute(meta, input, {
      actor: user,
      roles,
      idempotencyKey,
      approvalId: reviewId,
    });

    if (!result.ok) {
      if (reviewId) {
        await db
          .update(approvalRequests)
          .set({ status: 'failed', attemptId: result.attemptId, error: result.message })
          .where(eq(approvalRequests.id, reviewId));
      }
      return { ok: false, error: 'FAILED', message: result.message };
    }
    if (reviewId) {
      await db
        .update(approvalRequests)
        .set({ status: 'pending_review', attemptId: result.attemptId })
        .where(
          and(
            eq(approvalRequests.id, reviewId),
            inArray(approvalRequests.status, ['pending_review', 'failed']),
          ),
        );
      return {
        ok: true,
        status: 'succeeded',
        data: result.data as O,
        attemptId: result.attemptId,
        reviewId,
      };
    }
    return {
      ok: true,
      status: 'succeeded',
      data: result.data as O,
      attemptId: result.attemptId,
    };
  };
  return Object.assign(fn, { [ACTION_META]: meta });
}

export async function moduleContext<M extends ModuleManifest>(
  manifest: M,
  opts?: { permission?: PermissionOf<M> },
): Promise<{
  user: SessionUser;
  roles: Role[];
  can(p: PermissionOf<M>): boolean;
  connectors: ScopedConnectors<M['connectors']>;
  db: Db;
  auditTrail(target: { type: string; id: string }): ReturnType<typeof auditTrail>;
  pendingApprovals(target?: { type: string; id: string }): ReturnType<typeof pendingForModule>;
}> {
  const session = await getSession();
  if (!session) redirect('/login');
  const permission = opts?.permission ?? manifest.viewPermission;
  if (!session.permissions.has(permission)) notFound();
  return {
    user: session.user,
    roles: session.roles,
    can: (p) => session.permissions.has(p),
    connectors: scopeConnectors(createConnectors(), manifest.connectors),
    db,
    auditTrail: (target) =>
      auditTrail({ module: manifest.id, targetType: target.type, targetId: target.id }),
    pendingApprovals: (target) => pendingForModule(manifest.id, target),
  };
}

export const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'must be a dollar amount with up to 2 decimals')
  .transform((s) => Math.round(Number(s) * 100))
  .refine((cents) => cents > 0, 'must be positive');
