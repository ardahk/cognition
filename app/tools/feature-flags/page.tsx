import Link from 'next/link';
import { moduleContext } from '@/platform/module';
import { DataTable, PageHeader, RelativeTime, SearchForm } from '@/platform/ui';
import { Badge } from '@/components/ui/badge';
import manifest from './manifest';
import { EnvState } from './env-state';
import { matchesSearch } from './rules';

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  const ctx = await moduleContext(manifest);
  const { q, tag } = await searchParams;
  const { data } = await ctx.connectors.flags.listFlags({ tag: tag || undefined });
  const flags = data.filter((f) => matchesSearch(f, q));

  return (
    <div>
      <PageHeader title={manifest.name} description="Every flag in the flag service, by environment." />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <SearchForm placeholder="Search by key, name, or tag" />
        {tag ? (
          <span className="flex items-center gap-2">
            Tag <Badge variant="secondary">{tag}</Badge>
            <Link href={`/tools/${manifest.id}${q ? `?q=${encodeURIComponent(q)}` : ''}`} className="underline">
              Clear
            </Link>
          </span>
        ) : null}
      </div>
      <DataTable
        rows={flags}
        empty="No flags match"
        columns={[
          {
            header: 'Flag',
            cell: (f) => (
              <Link href={`/tools/${manifest.id}/${encodeURIComponent(f.key)}`} className="block hover:underline">
                <span className="font-mono text-xs">{f.key}</span>
                <span className="block text-xs text-muted-foreground">{f.name}</span>
              </Link>
            ),
          },
          { header: 'Development', cell: (f) => <EnvState state={f.environments.development} /> },
          { header: 'Staging', cell: (f) => <EnvState state={f.environments.staging} /> },
          { header: 'Production', cell: (f) => <EnvState state={f.environments.production} /> },
          { header: 'Owner', cell: (f) => f.owner },
          {
            header: 'Tags',
            cell: (f) => (
              <span className="flex flex-wrap gap-1">
                {f.tags.map((t) => (
                  <Link key={t} href={`/tools/${manifest.id}?tag=${encodeURIComponent(t)}`}>
                    <Badge variant="outline">{t}</Badge>
                  </Link>
                ))}
              </span>
            ),
          },
          {
            header: 'Last change',
            cell: (f) => (
              <span className="text-xs">
                <RelativeTime date={f.updated_at} />
                <span className="block text-muted-foreground">{f.updated_by}</span>
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
