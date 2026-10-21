'use server';

import { z } from 'zod';
import { defineAction } from '@/platform/module';
import manifest from './manifest';
import { ENVIRONMENTS, flagTarget, isStale, onOff } from './rules';

const key = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/);
const rollout = z.coerce.number().int().min(0).max(100);

export const setFlag = defineAction(manifest, {
  name: 'flag.set',
  permission: 'feature-flags.edit',
  input: z.object({
    key,
    env: z.enum(ENVIRONMENTS),
    enabled: z.stringbool(),
    rollout,
    fromEnabled: z.stringbool(),
    fromRollout: rollout,
  }),
  target: (i) => flagTarget(i.key),
  approval: (i) =>
    i.env === 'production'
      ? {
          permission: 'feature-flags.approve',
          reason: `Production change to ${i.key}: ${onOff(i.fromEnabled, i.fromRollout)} → ${onOff(i.enabled, i.rollout)}`,
        }
      : null,
  handler: async ({ input, ctx }) => {
    const current = (await ctx.connectors.flags.getFlag(input.key)).environments[input.env];
    if (isStale(current, input)) {
      throw new Error(`${input.key} changed in ${input.env} since this change was requested. Reload and try again.`);
    }
    if (ctx.approvedBy) ctx.record({ approvedBy: ctx.approvedBy.email });
    const flag = await ctx.connectors.flags.setEnvironment(input.key, input.env, {
      enabled: input.enabled,
      rolloutPercentage: input.rollout,
      actor: ctx.user.email,
      idempotencyKey: ctx.idempotencyKey,
    });
    return { key: flag.key, env: input.env, ...flag.environments[input.env], version: flag.version };
  },
});

export const killFlag = defineAction(manifest, {
  name: 'flag.kill',
  permission: 'feature-flags.kill',
  input: z.object({ key, reason: z.string().trim().min(5).max(500) }),
  target: (i) => flagTarget(i.key),
  approval: (i) => ({
    permission: 'feature-flags.approve',
    mode: 'post-hoc',
    reason: `Kill switch: ${i.key} turned off in production. Reason: ${i.reason}`,
  }),
  handler: async ({ input, ctx }) => {
    const flag = await ctx.connectors.flags.setEnvironment(input.key, 'production', {
      enabled: false,
      actor: ctx.user.email,
      idempotencyKey: ctx.idempotencyKey,
    });
    return { key: flag.key, env: 'production', ...flag.environments.production, version: flag.version };
  },
});
