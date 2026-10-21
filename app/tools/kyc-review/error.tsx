'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-destructive">{error.message}</p>
      <button type="button" onClick={reset} className="mt-2 text-sm underline">
        Try again
      </button>
    </div>
  );
}
