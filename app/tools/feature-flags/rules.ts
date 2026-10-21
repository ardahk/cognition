export const ENVIRONMENTS = ['development', 'staging', 'production'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

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
