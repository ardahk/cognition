import { z } from 'zod';

export class VendorError extends Error {
  constructor(
    public vendor: string,
    public status: number,
    public type: string,
    message: string,
  ) {
    super(message);
    this.name = 'VendorError';
  }
}

export type RequestOptions<S extends z.ZodType> = {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  idempotencyKey?: string;
  schema: S;
};

export type RequestFn = <S extends z.ZodType>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  opts: RequestOptions<S>,
) => Promise<{ status: number; replayed: boolean; data: z.output<S> }>;

export function createHttpClient(
  vendor: string,
  { baseUrl, apiKey }: { baseUrl: string; apiKey: string },
): RequestFn {
  return async function request(method, path, { query, body, idempotencyKey, schema }) {
    const url = new URL(baseUrl + path);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        signal: AbortSignal.timeout(10_000),
        headers: {
          authorization: `Bearer ${apiKey}`,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new VendorError(
        vendor,
        0,
        'network_error',
        e instanceof Error ? e.message : 'network error',
      );
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (json as { error?: { type?: string; message?: string } } | null)?.error;
      throw new VendorError(
        vendor,
        res.status,
        err?.type ?? 'api_error',
        err?.message ?? `HTTP ${res.status}`,
      );
    }
    return {
      status: res.status,
      replayed: res.headers.get('idempotent-replayed') === 'true',
      data: schema.parse(json),
    };
  };
}
