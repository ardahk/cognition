'use client';

import { useRouter } from 'next/navigation';
import { useState, type ComponentProps } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { issueDescription, stableJson, useIdempotencyKey, type SubmitAction } from './shared';

export function ActionButton({
  action,
  args,
  label,
  confirm,
  variant,
}: {
  action: SubmitAction;
  args: Record<string, unknown>;
  label: string;
  confirm?: string;
  variant?: ComponentProps<typeof Button>['variant'];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const idem = useIdempotencyKey();

  async function onClick() {
    if (pending) return;
    if (confirm && !window.confirm(confirm)) return;
    const idempotencyKey = idem.keyFor(stableJson(args));
    setPending(true);
    try {
      const res = await action({ ...args, idempotencyKey });
      if (!res.ok) {
        toast.error(res.message, { description: issueDescription(res.issues) });
        return;
      }
      router.refresh();
      if (res.status === 'failed') {
        toast.error(res.message ?? 'Action failed');
        return;
      }
      idem.reset();
      toast(res.status === 'pending_approval' ? 'Sent for approval' : 'Done');
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant={variant} disabled={pending} onClick={onClick}>
      {label}
    </Button>
  );
}
