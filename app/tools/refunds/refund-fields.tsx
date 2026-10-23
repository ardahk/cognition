'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NOTE_MAX, REFUND_REASONS, needsApproval } from './rules';

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

function toCents(dollars: string) {
  return /^\d+(\.\d{1,2})?$/.test(dollars) ? Math.round(Number(dollars) * 100) : 0;
}

export function RefundFields({ refundable, alreadyRefunded }: { refundable: number; alreadyRefunded: number }) {
  const full = (refundable / 100).toFixed(2);
  const [amount, setAmount] = useState(full);
  const approval = needsApproval(alreadyRefunded, toCents(amount));

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Amount (USD)
        <div className="flex items-center gap-2">
          <Input
            name="amount"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="max-w-40"
          />
          <button type="button" className="text-xs underline" onClick={() => setAmount(full)}>
            Full refund (${full})
          </button>
        </div>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Reason code
        <select name="reason" required defaultValue="" className={selectClass}>
          <option value="" disabled>
            Reason code…
          </option>
          {REFUND_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Note
        <Textarea name="note" required rows={2} maxLength={NOTE_MAX} placeholder="Short note for the record" />
      </label>
      <input type="hidden" name="approval" value={String(approval)} />
      {approval ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Refunds on this payment would total over $250, so an ops lead must approve this refund before it is issued.
        </p>
      ) : null}
    </div>
  );
}
