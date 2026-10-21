export const ENVIRONMENTS = ['development', 'staging', 'production'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const onOff = (enabled: boolean | undefined, pct: number | undefined) =>
  `${enabled ? 'on' : 'off'} ${pct}%`;

export const flagTarget = (key: string) => ({ type: 'flag', id: key });

type Searchable = { key: string; name: string; tags: string[] };

export function matchesSearch(flag: Searchable, q: string | undefined) {
  const needle = q?.trim().toLowerCase();
  if (!needle) return true;
  return (
    flag.key.toLowerCase().includes(needle) ||
    flag.name.toLowerCase().includes(needle) ||
    flag.tags.some((t) => t.toLowerCase().includes(needle))
  );
}

type EnvState = { enabled: boolean; rollout_percentage: number };
type Change = { enabled: boolean; rollout: number; fromEnabled: boolean; fromRollout: number };

// A change applies only if the env is still in the state it was requested from, or already
// in the target state (an idempotent retry). Anything else means someone changed it meanwhile.
export function isStale(current: EnvState, c: Change) {
  const is = (enabled: boolean, pct: number) => current.enabled === enabled && current.rollout_percentage === pct;
  return !is(c.fromEnabled, c.fromRollout) && !is(c.enabled, c.rollout);
}
