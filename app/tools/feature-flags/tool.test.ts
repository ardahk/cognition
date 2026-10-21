import { beforeEach, describe, expect, it } from 'vitest';
import { moduleContext } from '@/platform/module';
import { decideAs, signInAs, useInProcessVendors } from '@/tests/helpers';
import manifest from './manifest';
import access from './access';
import { killFlag, setFlag } from './actions';
import { flagTarget, isStale, matchesSearch } from './rules';

type Persona = Parameters<typeof signInAs>[0];

async function as(persona: Persona) {
  signInAs(persona);
  return moduleContext(manifest);
}

async function allFlags() {
  const ctx = await as('jordan');
  return (await ctx.connectors.flags.listFlags()).data;
}

const used = new Set<string>();
async function takeFlag(pred: (f: Awaited<ReturnType<typeof allFlags>>[number]) => boolean = () => true) {
  const f = (await allFlags()).find((x) => !used.has(x.key) && pred(x));
  if (!f) throw new Error('no suitable seeded flag');
  used.add(f.key);
  return f;
}

async function peekFlag(pred: (f: Awaited<ReturnType<typeof allFlags>>[number]) => boolean) {
  const f = (await allFlags()).find((x) => !used.has(x.key) && pred(x));
  if (!f) throw new Error('no suitable seeded flag');
  return f;
}

async function getFlag(key: string) {
  const ctx = await as('jordan');
  return ctx.connectors.flags.getFlag(key);
}

type Flag = Awaited<ReturnType<typeof getFlag>>;
type Env = keyof Flag['environments'];

function change(f: Flag, env: Env, enabled: boolean, rollout: number | string, extra: Record<string, unknown> = {}) {
  const from = f.environments[env];
  return setFlag({
    key: f.key,
    env,
    enabled: String(enabled),
    rollout,
    fromEnabled: String(from.enabled),
    fromRollout: String(from.rollout_percentage),
    ...extra,
  });
}

beforeEach(() => {
  useInProcessVendors();
});

describe('access', () => {
  it.each(['alex', 'priya', 'sam', 'morgan'] as const)('%s cannot open the tool (404)', async (p) => {
    await expect(as(p)).rejects.toThrow('notFound()');
  });

  it.each(['jordan', 'taylor'] as const)('%s can open the tool', async (p) => {
    await expect(as(p)).resolves.toBeTruthy();
  });

  it('grants edit to engineers, kill to on-call, approve to eng leads only', () => {
    expect(access.grants).toEqual({
      engineer: ['feature-flags.view', 'feature-flags.edit'],
      oncall: ['feature-flags.view', 'feature-flags.kill'],
      eng_lead: ['feature-flags.view', 'feature-flags.approve'],
    });
  });

  it('non-engineers cannot change or kill flags', async () => {
    const f = await peekFlag((x) => x.environments.production.enabled);
    signInAs('alex');
    expect(await change(f, 'development', true, 50)).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await killFlag({ key: f.key, reason: 'Incident 123' })).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect(await getFlag(f.key)).toMatchObject({ environments: f.environments, version: f.version });
  });

  it('an engineer who is not on call cannot use the kill switch', async () => {
    const f = await peekFlag((x) => x.environments.production.enabled);
    signInAs('taylor');
    expect(await killFlag({ key: f.key, reason: 'Incident 123' })).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect((await getFlag(f.key)).environments.production.enabled).toBe(true);
  });
});

describe('development and staging', () => {
  it.each(['development', 'staging'] as const)('%s changes apply immediately', async (env) => {
    const f = await takeFlag();
    signInAs('jordan');
    const res = await change(f, env, true, '35');
    expect(res).toMatchObject({ ok: true, status: 'succeeded', data: { enabled: true, rollout_percentage: 35 } });
    const after = await getFlag(f.key);
    expect(after.environments[env]).toEqual({ enabled: true, rollout_percentage: 35 });
    expect(after.environments.production).toEqual(f.environments.production);
    expect(after.updated_by).toBe('jordan@fernpay.test');
  });

  it('rejects rollout outside 0–100 and unknown environments', async () => {
    const f = await takeFlag();
    signInAs('jordan');
    for (const input of [
      { rollout: 101 },
      { rollout: -1 },
      { env: 'qa' },
      { fromEnabled: undefined },
    ]) {
      expect(await change(f, 'staging', true, 10, input)).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    }
  });
});

describe('production', () => {
  it('a production change waits for eng lead approval and does not apply yet', async () => {
    const f = await takeFlag();
    signInAs('jordan');
    const res = await change(f, 'production', true, 10);
    expect(res).toMatchObject({ ok: true, status: 'pending_approval' });
    expect(await getFlag(f.key)).toMatchObject({ environments: f.environments, version: f.version });

    const ctx = await as('taylor');
    const [pending] = await ctx.pendingApprovals(flagTarget(f.key));
    expect(pending).toMatchObject({
      mode: 'pre',
      status: 'pending',
      action: 'flag.set',
      approverPermission: 'feature-flags.approve',
      requestedById: 'jordan',
      input: { key: f.key, env: 'production', enabled: true, rollout: 10 },
    });
  });

  it('a change requested against a state that has since changed is refused', async () => {
    const f = await takeFlag((x) => x.environments.staging.enabled);
    signInAs('jordan');
    expect(await change(f, 'staging', false, 0)).toMatchObject({ ok: true, status: 'succeeded' });
    // A second change built from the stale page state (e.g. a queued approval after a kill) must not overwrite.
    const stale = await change(f, 'staging', true, 100);
    expect(stale).toMatchObject({ ok: false, error: 'FAILED' });
    expect((stale as { message: string }).message).toContain('changed in staging');
    expect((await getFlag(f.key)).environments.staging).toEqual({ enabled: false, rollout_percentage: 0 });
  });

  it('a retry of a successful change with the same idempotency key replays instead of failing', async () => {
    const f = await takeFlag();
    signInAs('jordan');
    const idempotencyKey = crypto.randomUUID();
    const first = await change(f, 'development', true, 42, { idempotencyKey });
    const retry = await change(f, 'development', true, 42, { idempotencyKey });
    expect(first).toMatchObject({ ok: true, status: 'succeeded' });
    expect(retry).toMatchObject({ ok: true, status: 'succeeded', data: { rollout_percentage: 42 } });
    expect((await getFlag(f.key)).version).toBe(f.version + 1);
  });

  it('an eng lead who requests a production change still needs a different approver', async () => {
    const f = await takeFlag();
    signInAs('taylor');
    const res = await change(f, 'production', false, 0);
    expect(res).toMatchObject({ ok: true, status: 'pending_approval' });
    const ctx = await as('taylor');
    const [pending] = await ctx.pendingApprovals(flagTarget(f.key));
    // The platform blocks deciding a request whose requestedById is the decider.
    expect(pending).toMatchObject({ requestedById: 'taylor', approverPermission: 'feature-flags.approve' });
    expect(await getFlag(f.key)).toMatchObject({ environments: f.environments });
  });

  it('an eng lead approves another engineer\'s production change but not their own', async () => {
    const f = await takeFlag();
    signInAs('jordan');
    const res = await change(f, 'production', true, 10);
    expect(res).toMatchObject({ ok: true, status: 'pending_approval' });
    const id = (res as { approvalId: string }).approvalId;

    // jordan has no approve permission, so the request stays pending for taylor.
    expect(await decideAs('jordan', id, 'approve')).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect(await decideAs('taylor', id, 'approve')).toMatchObject({ ok: true, status: 'executed' });
    expect((await getFlag(f.key)).environments.production).toEqual({
      enabled: true,
      rollout_percentage: 10,
    });

    const own = await takeFlag();
    signInAs('taylor');
    const ownRes = await change(own, 'production', true, 25);
    expect(ownRes).toMatchObject({ ok: true, status: 'pending_approval' });
    const ownId = (ownRes as { approvalId: string }).approvalId;
    expect(await decideAs('taylor', ownId, 'approve')).toMatchObject({
      ok: false,
      error: 'SELF_APPROVAL',
    });
    expect(await getFlag(own.key)).toMatchObject({
      environments: own.environments,
      version: own.version,
    });
  });
});

describe('kill switch', () => {
  it('turns production off immediately and opens a review for an eng lead', async () => {
    const f = await takeFlag((x) => x.environments.production.enabled);
    signInAs('jordan');
    const res = await killFlag({ key: f.key, reason: 'Error spike, INC-42' });
    expect(res).toMatchObject({ ok: true, status: 'succeeded', data: { enabled: false } });
    expect((res as { reviewId?: string }).reviewId).toBeTruthy();

    const after = await getFlag(f.key);
    expect(after.environments.production.enabled).toBe(false);
    expect(after.environments.development).toEqual(f.environments.development);
    expect(after.environments.staging).toEqual(f.environments.staging);

    const ctx = await as('taylor');
    const [review] = await ctx.pendingApprovals(flagTarget(f.key));
    expect(review).toMatchObject({
      mode: 'post-hoc',
      status: 'pending_review',
      action: 'flag.kill',
      approverPermission: 'feature-flags.approve',
      requestedById: 'jordan',
    });
    expect(review.reason).toContain('Error spike, INC-42');
  });

  it('requires a reason', async () => {
    const f = await peekFlag((x) => x.environments.production.enabled);
    signInAs('jordan');
    expect(await killFlag({ key: f.key })).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect(await killFlag({ key: f.key, reason: ' ' })).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await getFlag(f.key)).environments.production.enabled).toBe(true);
  });

  it('a retry with the same idempotency key succeeds without a second write', async () => {
    const f = await takeFlag((x) => x.environments.production.enabled);
    signInAs('jordan');
    const idempotencyKey = crypto.randomUUID();
    expect(await killFlag({ key: f.key, reason: 'INC-9 retry', idempotencyKey })).toMatchObject({ ok: true });
    expect(await killFlag({ key: f.key, reason: 'INC-9 retry', idempotencyKey })).toMatchObject({
      ok: true,
      status: 'succeeded',
      data: { enabled: false },
    });
    expect(await getFlag(f.key)).toMatchObject({ version: f.version + 1 });
  });
});

describe('history', () => {
  it('records each change against the flag', async () => {
    const f = await takeFlag((x) => x.environments.production.enabled);
    signInAs('jordan');
    await change(f, 'staging', false, 0);
    await change(f, 'production', true, 100);
    await killFlag({ key: f.key, reason: 'Rollback for INC-7' });

    const ctx = await as('jordan');
    const trail = await ctx.auditTrail(flagTarget(f.key));
    const seen = trail.map((e) => `${e.action}:${e.status}`);
    expect(seen).toEqual(
      expect.arrayContaining([
        'feature-flags.flag.set:succeeded',
        'feature-flags.flag.set:pending_approval',
        'feature-flags.flag.kill:succeeded',
      ]),
    );
    expect(trail.every((e) => e.actorEmail === 'jordan@fernpay.test')).toBe(true);
  });
});

describe('isStale', () => {
  const c = { fromEnabled: true, fromRollout: 25, enabled: true, rollout: 50 };
  it('is fresh in the requested-from state or already in the target state', () => {
    expect(isStale({ enabled: true, rollout_percentage: 25 }, c)).toBe(false);
    expect(isStale({ enabled: true, rollout_percentage: 50 }, c)).toBe(false);
  });
  it('is stale after any other change, e.g. a kill', () => {
    expect(isStale({ enabled: false, rollout_percentage: 25 }, c)).toBe(true);
    expect(isStale({ enabled: true, rollout_percentage: 10 }, c)).toBe(true);
  });
});

describe('search', () => {
  const flag = { key: 'new-checkout-flow', name: 'New checkout flow', tags: ['checkout', 'web'] };
  it('matches key, name, or tag case-insensitively', () => {
    expect(matchesSearch(flag, undefined)).toBe(true);
    expect(matchesSearch(flag, 'CHECKOUT-flow')).toBe(true);
    expect(matchesSearch(flag, 'web')).toBe(true);
    expect(matchesSearch(flag, 'ledger')).toBe(false);
  });
});
