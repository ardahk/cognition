import 'server-only';
import { existsSync } from 'node:fs';
import { z } from 'zod';

if (existsSync('.env')) process.loadEnvFile('.env');

const envSchema = z.object({
  SESSION_SECRET: z.string().min(32),
  AUTH_MODE: z.enum(['mock', 'oidc']).default('mock'),
  VENDOR_BASE_URL: z.url(),
  PAYMENTS_API_KEY: z.string().min(1),
  KYC_API_KEY: z.string().min(1),
  LEDGER_API_KEY: z.string().min(1),
  FLAGS_API_KEY: z.string().min(1),
});

export const env = envSchema.parse(process.env);
