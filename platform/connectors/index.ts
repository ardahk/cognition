import { env } from '../env';
import { createHttpClient } from './http';
import { createPaymentsConnector } from './payments';
import { createKycConnector } from './kyc';
import { createLedgerConnector } from './ledger';
import { createFlagsConnector } from './flags';
import type { ConnectorName, ConnectorScopes } from './scopes';

export { VendorError } from './http';
export { CONNECTOR_SCOPES, RISKS, riskOf } from './scopes';
export type { ConnectorName, ConnectorScopes, Risk, ScopeOf } from './scopes';
export type { RequestFn } from './http';
export type { PaymentsConnector } from './payments';
export type { KycConnector } from './kyc';
export type { LedgerConnector } from './ledger';
export type { FlagsConnector } from './flags';

export function createConnectors() {
  const client = (vendor: ConnectorName, apiKey: string) =>
    createHttpClient(vendor, { baseUrl: `${env.VENDOR_BASE_URL}/${vendor}`, apiKey });
  return {
    payments: createPaymentsConnector(client('payments', env.PAYMENTS_API_KEY)),
    kyc: createKycConnector(client('kyc', env.KYC_API_KEY)),
    ledger: createLedgerConnector(client('ledger', env.LEDGER_API_KEY)),
    flags: createFlagsConnector(client('flags', env.FLAGS_API_KEY)),
  };
}

export type Connectors = ReturnType<typeof createConnectors>;

export class ConnectorScopeError extends Error {
  constructor(connector: string, method: string, scope: string) {
    super(
      `${connector}.${method} requires scope "${scope}" (declare it in manifest.connectors)`,
    );
    this.name = 'ConnectorScopeError';
  }
}

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

export type ScopedConnectors<D extends ConnectorScopes> = {
  [C in keyof D & ConnectorName]: UnionToIntersection<
    Connectors[C][D[C] extends readonly (infer S)[]
      ? S extends keyof Connectors[C]
        ? S
        : never
      : never]
  >;
};

export function scopeConnectors<D extends ConnectorScopes>(
  all: Connectors,
  declared: D,
): ScopedConnectors<D> {
  const scoped: Record<string, unknown> = {};
  for (const name of Object.keys(declared) as ConnectorName[]) {
    const grouped = all[name] as Record<string, Record<string, unknown>>;
    const scopes = declared[name] ?? [];
    const allowed = new Set(scopes.flatMap((s) => Object.keys(grouped[s] ?? {})));
    const scopeOf = new Map(
      Object.entries(grouped).flatMap(([s, methods]) =>
        Object.keys(methods).map((m) => [m, s] as const),
      ),
    );
    scoped[name] = new Proxy(
      {},
      {
        get(_t, prop) {
          if (typeof prop !== 'string') return undefined;
          if (allowed.has(prop)) {
            for (const s of scopes) {
              const v = grouped[s]?.[prop];
              if (v !== undefined) return v;
            }
          }
          const owner = scopeOf.get(prop);
          if (owner) throw new ConnectorScopeError(name, prop, owner);
          return undefined;
        },
      },
    );
  }
  return scoped as ScopedConnectors<D>;
}
