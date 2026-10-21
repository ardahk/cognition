import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as platformSchema from './schema';
import * as vendorSimSchema from '../../mock-vendors/schema';

const url =
  process.env.DATABASE_URL ??
  (() => {
    throw new Error('DATABASE_URL is not set — copy .env.example to .env or export it');
  })();

const schema = { ...platformSchema, ...vendorSimSchema };

type DbHandle = { sql: postgres.Sql; db: Db };
const globalForDb = globalThis as { __toolyardDb?: DbHandle };

function create(): DbHandle {
  const sql = postgres(url);
  return { sql, db: drizzle(sql, { schema }) };
}

const handle =
  process.env.NODE_ENV === 'production' ? create() : (globalForDb.__toolyardDb ??= create());

export const sql = handle.sql;
export const db = handle.db;
export type Db = ReturnType<typeof drizzle<typeof schema>>;
