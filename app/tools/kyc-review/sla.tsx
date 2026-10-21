import { RelativeTime } from '@/platform/ui';
import { Badge } from '@/components/ui/badge';
import { FINAL_STATUSES, isOverdue } from './rules';

export function Sla({ dueAt, status }: { dueAt: string; status: string }) {
  if (FINAL_STATUSES.includes(status)) return <span className="text-muted-foreground">—</span>;
  const overdue = isOverdue(dueAt);
  return (
    <span className="inline-flex items-center gap-2">
      <RelativeTime date={dueAt} />
      {overdue ? (
        <Badge variant="outline" className="border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
          Overdue
        </Badge>
      ) : null}
    </span>
  );
}
