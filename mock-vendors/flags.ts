import { and, arrayContains, eq, ilike, or } from 'drizzle-orm';
import { flags } from './schema';
import { vendorError, type Route } from './router';

function flagShape(f: typeof flags.$inferSelect) {
  return {
    key: f.key,
    object: 'flag',
    name: f.name,
    description: f.description,
    owner: f.owner,
    tags: f.tags,
    environments: f.environments,
    version: f.version,
    updated_at: f.updatedAt,
    updated_by: f.updatedBy,
  };
}

const ENVIRONMENTS = ['development', 'staging', 'production'] as const;

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/v1/flags',
    handler: async ({ query, db }) => {
      const conds = [];
      const q = query.get('query');
      if (q) conds.push(or(ilike(flags.key, `%${q}%`), ilike(flags.name, `%${q}%`)));
      const tag = query.get('tag');
      if (tag) conds.push(arrayContains(flags.tags, [tag]));
      const rows = await db
        .select()
        .from(flags)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(flags.key);
      return { body: { object: 'list', data: rows.map(flagShape), has_more: false } };
    },
  },
  {
    method: 'GET',
    path: '/v1/flags/:key',
    handler: async ({ params, db }) => {
      const [f] = await db.select().from(flags).where(eq(flags.key, params.key));
      if (!f) return { status: 404, body: vendorError('not_found', `No such flag ${params.key}`) };
      return { body: flagShape(f) };
    },
  },
  {
    method: 'PATCH',
    path: '/v1/flags/:key/environments/:env',
    handler: async ({ params, body, db }) => {
      const [f] = await db.select().from(flags).where(eq(flags.key, params.key));
      if (!f) return { status: 404, body: vendorError('not_found', `No such flag ${params.key}`) };
      const env = params.env as keyof typeof f.environments;
      if (!ENVIRONMENTS.includes(env)) {
        return {
          status: 404,
          body: vendorError('not_found', `No such environment ${params.env}`),
        };
      }
      const input = (body ?? {}) as {
        enabled?: boolean;
        rollout_percentage?: number;
        actor?: string;
      };
      if (input.enabled === undefined && input.rollout_percentage === undefined) {
        return {
          status: 422,
          body: vendorError('validation_error', 'enabled or rollout_percentage is required'),
        };
      }
      if (
        input.rollout_percentage !== undefined &&
        (!Number.isInteger(input.rollout_percentage) ||
          input.rollout_percentage < 0 ||
          input.rollout_percentage > 100)
      ) {
        return {
          status: 422,
          body: vendorError('validation_error', 'rollout_percentage must be an integer 0–100'),
        };
      }
      const environments = {
        ...f.environments,
        [env]: {
          enabled: input.enabled ?? f.environments[env].enabled,
          rollout_percentage: input.rollout_percentage ?? f.environments[env].rollout_percentage,
        },
      };
      const [updated] = await db
        .update(flags)
        .set({
          environments,
          version: f.version + 1,
          updatedAt: new Date().toISOString(),
          updatedBy: input.actor ?? 'unknown',
        })
        .where(eq(flags.key, f.key))
        .returning();
      return { body: flagShape(updated) };
    },
  },
];
