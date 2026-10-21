import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const LEVEL_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export function Risk({ score, level }: { score: number; level: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono tabular-nums">{score}</span>
      <Badge variant="outline" className={cn('border-transparent', LEVEL_COLORS[level])}>
        {level}
      </Badge>
    </span>
  );
}
