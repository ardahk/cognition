import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const COLORS: [readonly string[], string][] = [
  [
    ['succeeded', 'approved', 'executed', 'reviewed', 'passed', 'clear'],
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  ],
  [
    [
      'pending',
      'pending_review',
      'pending_approval',
      'executing',
      'attempted',
      'needs_info',
      'needs_review',
      'partially_refunded',
    ],
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  ],
  [
    ['failed', 'declined', 'rejected', 'denied', 'hit'],
    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  ],
  [['escalated'], 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'],
  [['refunded'], 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'],
];

export const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  sensitive: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export function StatusBadge({ status }: { status: string }) {
  const color =
    COLORS.find(([statuses]) => statuses.includes(status))?.[1] ??
    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  return (
    <Badge variant="outline" className={cn('border-transparent font-mono', color)}>
      {status}
    </Badge>
  );
}
