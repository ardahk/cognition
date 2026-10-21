import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, type Db } from '@/platform/db/client';
import { idempotencyKeys } from './schema';
import { routes as paymentRoutes } from './payments';
import { routes as kycRoutes } from './kyc';
import { routes as ledgerRoutes } from './ledger';
import { routes as flagRoutes } from './flags';

export type VendorName = 'payments' | 'kyc' | 'ledger' | 'flags';

export type VendorRequest = {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  db: Db;
};

export type Route = {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  handler: (req: VendorRequest) => Promise<{ status?: number; body: unknown }>;
};

const ROUTES: Record<VendorName, Route[]> = {
  payments: paymentRoutes,
  kyc: kycRoutes,
  ledger: ledgerRoutes,
  flags: flagRoutes,
};

export function vendorError(type: string, message: string) {
  return { error: { type, message } };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

function match(route: Route, method: string, path: string): Record<string, string> | null {
  if (route.method !== method) return null;
  const want = route.path.split('/').filter(Boolean);
  const got = path.split('/').filter(Boolean);
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(got[i]);
    else if (want[i] !== got[i]) return null;
  }
  return params;
}

export async function handleMockVendorRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // /api/mock/<vendor>/<rest…>
  if (parts[0] !== 'api' || parts[1] !== 'mock' || !parts[2]) {
    return Response.json(vendorError('not_found', 'Unknown path'), { status: 404 });
  }
  const vendor = parts[2] as VendorName;
  const routes = ROUTES[vendor];
  if (!routes) {
    return Response.json(vendorError('not_found', `Unknown vendor ${vendor}`), { status: 404 });
  }
  const path = '/' + parts.slice(3).join('/');

  const expectedKey = process.env[`${vendor.toUpperCase()}_API_KEY`];
  if (!expectedKey || req.headers.get('authorization') !== `Bearer ${expectedKey}`) {
    return Response.json(vendorError('authentication_error', 'Invalid or missing API key'), {
      status: 401,
    });
  }

  let route: Route | undefined;
  let params: Record<string, string> | null = null;
  for (const r of routes) {
    params = match(r, req.method, path);
    if (params) {
      route = r;
      break;
    }
  }
  if (!route || !params) {
    return Response.json(vendorError('not_found', `No route ${req.method} ${path}`), {
      status: 404,
    });
  }

  let body: unknown = null;
  if (req.method !== 'GET') {
    body = await req.json().catch(() => null);
  }

  const run = async (): Promise<{ status: number; body: unknown }> => {
    try {
      const result = await route.handler({ params: params!, query: url.searchParams, body, db });
      return { status: result.status ?? 200, body: result.body };
    } catch (e) {
      return {
        status: 500,
        body: vendorError('internal_error', e instanceof Error ? e.message : 'internal error'),
      };
    }
  };

  if (req.method === 'GET') {
    const { status, body } = await run();
    return Response.json(body, { status });
  }

  const key = req.headers.get('idempotency-key');
  if (!key) {
    return Response.json(
      vendorError('idempotency_key_required', 'Idempotency-Key header is required'),
      { status: 400 },
    );
  }

  const requestHash = createHash('sha256')
    .update(`${req.method} ${path} ${stableStringify(body)}`)
    .digest('hex');

  const inserted = await db
    .insert(idempotencyKeys)
    .values({ vendor, key, requestHash })
    .onConflictDoNothing()
    .returning();

  if (inserted.length) {
    const { status, body: response } = await run();
    if (status >= 500) {
      await db
        .delete(idempotencyKeys)
        .where(and(eq(idempotencyKeys.vendor, vendor), eq(idempotencyKeys.key, key)));
    } else {
      await db
        .update(idempotencyKeys)
        .set({ status, response })
        .where(and(eq(idempotencyKeys.vendor, vendor), eq(idempotencyKeys.key, key)));
    }
    return Response.json(response, { status });
  }

  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.vendor, vendor), eq(idempotencyKeys.key, key)));
  if (existing.requestHash !== requestHash) {
    return Response.json(
      vendorError('idempotency_key_reused', 'Idempotency-Key was used with a different request'),
      { status: 409 },
    );
  }
  if (existing.response == null) {
    return Response.json(
      vendorError('idempotency_request_in_progress', 'Request with this key is in progress'),
      { status: 409 },
    );
  }
  return Response.json(existing.response, {
    status: existing.status ?? 200,
    headers: { 'Idempotent-Replayed': 'true' },
  });
}
