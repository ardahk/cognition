import { redirect } from 'next/navigation';
import { env } from '@/platform/env';
import { getSession } from '@/platform/auth/session';
import { signInAs } from '@/platform/auth/actions';
import { PERSONAS, type PersonaId } from '@/platform/auth/personas';
import { rolesForGroups } from '@/platform/auth/roles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/platform/ui';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getSession()) redirect('/');

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center p-6">
      <PageHeader
        title="Sign in"
        description="Pick a persona. In production this is your company SSO."
      />
      {env.AUTH_MODE !== 'mock' ? (
        <p className="text-muted-foreground">SSO is not configured.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.values(PERSONAS).map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{p.title}</p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1">
                  {rolesForGroups(p.groups).map((r) => (
                    <Badge key={r} variant="secondary">
                      {r}
                    </Badge>
                  ))}
                </div>
                <form action={signInAs.bind(null, p.id as PersonaId, next)}>
                  <Button type="submit" variant="outline">
                    Sign in as {p.name.split(' ')[0]}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
