'use client';

import { useRef } from 'react';

export type SubmitResult =
  | { ok: true; status: string; message?: string; [key: string]: unknown }
  | { ok: false; error: string; message: string; issues?: Record<string, string[]> };

export type SubmitAction = (input: Record<string, unknown>) => Promise<SubmitResult>;

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// Idempotency-key rule: the same payload reuses its key, a different payload mints a
// new one, and a succeeded/pending_approval result forgets the payload.
export function useIdempotencyKey() {
  const last = useRef<{ payload: string; key: string } | null>(null);
  return {
    keyFor(payload: string) {
      if (last.current?.payload === payload) return last.current.key;
      const key = crypto.randomUUID();
      last.current = { payload, key };
      return key;
    },
    reset() {
      last.current = null;
    },
  };
}

export function issueDescription(issues: Record<string, string[]> | undefined) {
  if (!issues) return undefined;
  const text = Object.entries(issues)
    .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
    .join('\n');
  return text || undefined;
}
