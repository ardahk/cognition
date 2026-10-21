import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { getSession } from "@/platform/auth/session";
import { visibleModules } from "@/platform/access";
import { listApprovals } from "@/platform/approvals/store";
import { PERSONAS, type PersonaId } from "@/platform/auth/personas";
import { AppShell } from "./shell";

export const metadata: Metadata = {
  title: "Toolyard",
  description: "Fernpay's internal-tools platform",
};

const personas = Object.values(PERSONAS).map((p) => ({
  id: p.id as PersonaId,
  name: p.name,
}));

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  let body: React.ReactNode = children;
  if (session) {
    const tools = visibleModules(session.permissions).map((m) => ({
      id: m.id,
      name: m.name,
      icon: m.nav.icon,
    }));
    const [needsApproval, needsReview] = await Promise.all([
      listApprovals.needsMyApproval(session),
      listApprovals.needsReview(session),
    ]);
    body = (
      <AppShell
        user={{ name: session.user.name, title: session.user.title, email: session.user.email }}
        roles={session.roles}
        tools={tools}
        personas={personas}
        approvalCount={needsApproval.length + needsReview.length}
        canAudit={session.permissions.has('platform.audit.view')}
        canAdmin={session.permissions.has('platform.admin.view')}
      >
        {children}
      </AppShell>
    );
  }
  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans")}>
      <body className="min-h-full flex flex-col">
        {body}
        <Toaster />
      </body>
    </html>
  );
}
