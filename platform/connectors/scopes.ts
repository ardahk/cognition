export const RISKS = ['low', 'sensitive', 'critical'] as const;
export type Risk = (typeof RISKS)[number];

export const CONNECTOR_SCOPES = {
  payments: { read: 'sensitive', refund: 'critical' },
  kyc: { read: 'sensitive', pii: 'sensitive', decide: 'critical' },
  ledger: { read: 'low', post: 'critical' },
  flags: { read: 'low', write: 'critical' },
} as const;

export type ConnectorName = keyof typeof CONNECTOR_SCOPES;
export type ScopeOf<C extends ConnectorName> = keyof (typeof CONNECTOR_SCOPES)[C];
export type ConnectorScopes = { [C in ConnectorName]?: readonly ScopeOf<C>[] };

export function riskOf(connectors: ConnectorScopes): Risk {
  let max = -1;
  for (const [name, scopes] of Object.entries(connectors)) {
    for (const scope of scopes ?? []) {
      const tier = CONNECTOR_SCOPES[name as ConnectorName][scope as never] as Risk;
      max = Math.max(max, RISKS.indexOf(tier));
    }
  }
  return max < 0 ? 'low' : RISKS[max];
}
