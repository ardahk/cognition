'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { Input } from '@/components/ui/input';

export function SearchForm({ param = 'q', placeholder }: { param?: string; placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get(param) ?? '').trim();
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    next.delete('after');
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} role="search" className="max-w-xs">
      <Input
        name={param}
        defaultValue={searchParams.get(param) ?? ''}
        placeholder={placeholder ?? 'Search'}
      />
    </form>
  );
}
