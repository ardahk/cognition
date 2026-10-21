import { existsSync } from 'node:fs';
import { vi } from 'vitest';

if (existsSync('.env')) process.loadEnvFile('.env');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const jar = ((globalThis as { __testCookies?: Map<string, string> }).__testCookies ??=
  new Map());

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name) } : undefined,
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect(${url})`);
  },
  notFound: () => {
    throw new Error('notFound()');
  },
}));
