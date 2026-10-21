import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./platform/db/schema.ts', './mock-vendors/schema.ts', './app/tools/*/schema.ts'],
  schemaFilter: ['public', 'vendor_sim'],
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
