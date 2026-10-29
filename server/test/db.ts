import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../src/db/schema';

// In-process Postgres (WASM): free, offline, one fresh database per call.
// Runs the real migrations in ./drizzle, so tests see the same tables as Neon.
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: join(import.meta.dirname, '../drizzle') });
  return { db, close: () => client.close() };
}
