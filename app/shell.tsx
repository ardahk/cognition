'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { icons, Wrench, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { signInAs, signOut } from '@/platform/auth/actions';
import type { PersonaId } from '@/platform/auth/personas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';

export type ShellTool = { id: string; name: string; icon: string };
export type ShellPersona = { id: PersonaId; name: string };

export function AppShell({
  user,
  roles,
  tools,
  personas,
  approvalCount,
  canAudit,
  canAdmin,
  children,
}: {
  user: { name: string; title: string; email: string };
  roles: string[];
  tools: ShellTool[];
  personas: ShellPersona[];
  approvalCount: number;
  canAudit: boolean;
  canAdmin: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const itemClass = 'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted';

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r">
        <Link href="/" className="block p-4">
          <div className="text-base font-semibold">Toolyard</div>
          <div className="text-xs text-muted-foreground">Fernpay internal tools</div>
        </Link>
        <nav className="flex flex-col gap-0.5 px-2">
          <Link href="/" className={itemClass}>
            Home
          </Link>
          {tools.map((t) => {
            const Icon = (icons as Record<string, LucideIcon>)[t.icon] ?? Wrench;
            return (
              <Link key={t.id} href={`/tools/${t.id}`} className={itemClass}>
                <Icon className="size-4" />
                {t.name}
              </Link>
            );
          })}
          <Separator className="my-2" />
          <Link href="/approvals" className={itemClass}>
            Approvals
            {approvalCount > 0 ? <Badge variant="secondary">{approvalCount}</Badge> : null}
          </Link>
          {canAudit ? (
            <Link href="/audit" className={itemClass}>
              Audit log
            </Link>
          ) : null}
          {canAdmin ? (
            <Link href="/admin" className={itemClass}>
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="mt-auto p-4">
          <a
            href={process.env.NEXT_PUBLIC_TOOL_REQUESTS_URL}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Request a tool
          </a>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{user.name}</span>
            <span className="text-muted-foreground">{user.title}</span>
            {roles.map((r) => (
              <Badge key={r} variant="secondary">
                {r}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="sm">Switch persona</Button>}
              />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Signed in as {user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {personas.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => signInAs(p.id, pathname)}>
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
