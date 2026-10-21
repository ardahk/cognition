import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { db, sql } from '../platform/db/client';
import { seedVendors } from '../mock-vendors/seed';

const command = process.argv[2];

async function push() {
  await sql`CREATE SCHEMA IF NOT EXISTS vendor_sim`;
  execFileSync('npx', ['drizzle-kit', 'push', '--force'], { stdio: 'inherit' });
  await sql.unsafe(readFileSync(join(__dirname, '../platform/db/append-only.sql'), 'utf8'));
}

async function seed() {
  await seedVendors(db);
  const toolsDir = join(__dirname, '../app/tools');
  if (!existsSync(toolsDir)) return;
  for (const entry of readdirSync(toolsDir, { withFileTypes: true })) {
    const seedFile = join(toolsDir, entry.name, 'seed.ts');
    if (entry.isDirectory() && existsSync(seedFile)) {
      const mod = await import(pathToFileURL(seedFile).href);
      await mod.default(db);
      console.log(`seeded ${entry.name}`);
    }
  }
}

async function reset() {
  await sql.unsafe(`
    DROP SCHEMA IF EXISTS vendor_sim CASCADE;
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
  `);
  await push();
  await seed();
}

async function main() {
  try {
    if (command === 'push') await push();
    else if (command === 'seed') await seed();
    else if (command === 'reset') await reset();
    else throw new Error(`unknown command ${command ?? '(none)'} — expected push|seed|reset`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
