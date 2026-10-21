import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/platform/auth/session';
import { visibleModules } from '@/platform/access';
import { listApprovals } from '@/platform/approvals/store';
import { PageHeader, RISK_COLORS } from '@/platform/ui';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/login');
  const tools = visibleModules(session.permissions);
  const [needsApproval, needsReview] = await Promise.all([
    listApprovals.needsMyApproval(session),
    listApprovals.needsReview(session),
  ]);
  const waiting = needsApproval.length + needsReview.length;

  return (
    <div>
      <PageHeader title="Tools" description="Everything on the paved road." />
      {waiting > 0 ? (
        <Link href="/approvals" className="text-primary underline-offset-4 hover:underline">
          {waiting} approval{waiting === 1 ? '' : 's'} waiting for you
        </Link>
      ) : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((m) => (
          <Link key={m.id} href={`/tools/${m.id}`}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  {m.name}
                  <Badge variant="outline" className={cn('border-transparent', RISK_COLORS[m.risk])}>
                    {m.risk}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">{m.description}</p>
                <p className="text-xs text-muted-foreground">{m.owner}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
        <a href={process.env.NEXT_PUBLIC_TOOL_REQUESTS_URL} target="_blank" rel="noreferrer">
          <Card className="h-full border-dashed transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardTitle>Request a tool</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Describe what you need in #tool-requests. Devin builds it; engineers approve it.
              </p>
            </CardContent>
          </Card>
        </a>
      </div>
      {tools.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No tools are visible to you yet. Tools are folders under app/tools/ built on the paved
          road — request one above, and it appears here once it ships and a role you hold is
          granted its view permission.
        </p>
      ) : null}
    </div>
  );
}
