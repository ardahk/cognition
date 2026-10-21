'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { issueDescription, stableJson, useIdempotencyKey, type SubmitAction } from './shared';

export function ActionForm({
  action,
  children,
  submitLabel,
  confirm,
  hidden,
  className,
}: {
  action: SubmitAction;
  children?: ReactNode;
  submitLabel?: string;
  confirm?: string;
  hidden?: Record<string, string>;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const idem = useIdempotencyKey();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    if (confirm && !window.confirm(confirm)) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter ?? undefined;
    const fields = Object.fromEntries(
      new FormData(form, submitter as HTMLElement | undefined),
    );
    const merged = { ...fields, ...hidden } as Record<string, unknown>;
    const idempotencyKey = idem.keyFor(stableJson(merged));
    setPending(true);
    try {
      const res = await action({ ...merged, idempotencyKey });
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
      form.reset();
      toast(res.status === 'pending_approval' ? 'Sent for approval' : 'Done');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
        {submitLabel ? <Button type="submit">{submitLabel}</Button> : null}
      </fieldset>
    </form>
  );
}
