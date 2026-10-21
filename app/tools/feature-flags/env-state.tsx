import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function EnvState({ state }: { state: { enabled: boolean; rollout_percentage: number } }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-mono',
        state.enabled
          ? 'border-green-300 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300'
          : 'text-muted-foreground',
      )}
    >
      {state.enabled ? 'On' : 'Off'} · {state.rollout_percentage}%
    </Badge>
  );
}
