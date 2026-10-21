'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function CursorPager({ nextCursor, param = 'after' }: { nextCursor?: string; param?: string }) {
  const searchParams = useSearchParams();
  const hasCursor = searchParams.has(param);
  if (!nextCursor && !hasCursor) return null;

  const first = new URLSearchParams(searchParams.toString());
  first.delete(param);
  const next = new URLSearchParams(searchParams.toString());
  if (nextCursor) next.set(param, nextCursor);

  return (
    <nav className="flex items-center gap-4 pt-4 text-sm">
      {hasCursor ? (
        <Link href={`?${first.toString()}`} className="text-primary underline-offset-4 hover:underline">
          First page
        </Link>
      ) : null}
      {nextCursor ? (
        <Link href={`?${next.toString()}`} className="text-primary underline-offset-4 hover:underline">
          Next
        </Link>
      ) : null}
    </nav>
  );
}
