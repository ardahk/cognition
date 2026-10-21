import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export default function globalSetup() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is not set');
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/db.ts', 'reset'], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
}
