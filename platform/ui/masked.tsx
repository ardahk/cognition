'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { stableJson, useIdempotencyKey, type SubmitAction } from './shared';

export function Masked({
  value,
  reveal,
}: {
  value: string;
  reveal?: { action: SubmitAction; args: Record<string, unknown> };
}) {
  const [asking, setAsking] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const idem = useIdempotencyKey();

  async function onReveal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || !reveal) return;
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim();
    const args = { ...reveal.args, reason };
    const idempotencyKey = idem.keyFor(stableJson(args));
    setPending(true);
    try {
      const res = await reveal.action({ ...args, idempotencyKey });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      idem.reset();
      setAsking(false);
      setRevealed((res.data as { value: string | null })?.value ?? null);
    } finally {
      setPending(false);
    }
  }

  if (revealed !== null) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono">{revealed}</span>
        <Button type="button" variant="ghost" onClick={() => setRevealed(null)}>
          Hide
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{value}</span>
      {reveal && !asking ? (
        <Button type="button" variant="ghost" onClick={() => setAsking(true)}>
          Reveal
        </Button>
      ) : null}
      {reveal && asking ? (
        <form onSubmit={onReveal} className="inline-flex items-center gap-2">
          <Input name="reason" required placeholder="Reason" className="h-7 w-44" />
          <Button type="submit" disabled={pending}>
            Reveal
          </Button>
        </form>
      ) : null}
    </span>
  );
}
