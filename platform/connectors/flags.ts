import { z } from 'zod';
import type { RequestFn } from './http';

export const flagEnvironmentSchema = z.object({
  enabled: z.boolean(),
  rollout_percentage: z.number().int().min(0).max(100),
});

export const flagSchema = z.object({
  key: z.string(),
  object: z.literal('flag'),
  name: z.string(),
  description: z.string(),
  owner: z.string(),
  tags: z.array(z.string()),
  environments: z.object({
    development: flagEnvironmentSchema,
    staging: flagEnvironmentSchema,
    production: flagEnvironmentSchema,
  }),
  version: z.number().int(),
  updated_at: z.string(),
  updated_by: z.string(),
});

const flagListSchema = z.object({
  object: z.literal('list'),
  data: z.array(flagSchema),
  has_more: z.boolean(),
});

export type Flag = z.output<typeof flagSchema>;
export type FlagEnvironment = keyof Flag['environments'];

export function createFlagsConnector(request: RequestFn) {
  return {
    read: {
      async listFlags({ query, tag }: { query?: string; tag?: string } = {}) {
        const { data } = await request('GET', '/v1/flags', {
          query: { query, tag },
          schema: flagListSchema,
        });
        return { data: data.data };
      },
      async getFlag(key: string): Promise<Flag> {
        const { data } = await request('GET', `/v1/flags/${key}`, { schema: flagSchema });
        return data;
      },
    },
    write: {
      async setEnvironment(key: string, env: FlagEnvironment, { enabled, rolloutPercentage, actor, idempotencyKey }: {
        enabled?: boolean;
        rolloutPercentage?: number;
        actor: string;
        idempotencyKey: string;
      }): Promise<Flag> {
        const { data } = await request('PATCH', `/v1/flags/${key}/environments/${env}`, {
          body: { enabled, rollout_percentage: rolloutPercentage, actor },
          idempotencyKey,
          schema: flagSchema,
        });
        return data;
      },
    },
  };
}

export type FlagsConnector = ReturnType<typeof createFlagsConnector>;
