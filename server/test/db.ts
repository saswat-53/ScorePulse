import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../src/db/schema';

// In-process Postgres (WASM): free, offline, one fresh database per call.
// Runs the real migrations in ./drizzle, so tests see the same tables as Neon.
export async function createTestDb() {
  const client = new PGlite();
  let statements = 0;
  let batchedStatements = 0;
  let batches = 0;
  const pglite = drizzle(client, { schema, logger: { logQuery: () => void statements++ } });
  await migrate(pglite, { migrationsFolder: join(import.meta.dirname, '../drizzle') });

  // PGlite has no `db.batch`, which on Neon sends many statements in one HTTP request. This one runs them
  // in order, so the poller sees the same interface in tests as in the Worker.
  const batch = async (queries: readonly PromiseLike<unknown>[]) => {
    batches++;
    batchedStatements += queries.length;
    const results: unknown[] = [];
    for (const query of queries) results.push(await query);
    return results;
  };
  const db = Object.assign(pglite, { batch }) as unknown as typeof pglite & NeonBatch;

  return {
    db,
    close: () => client.close(),
    // What Neon would count as HTTP requests: every statement outside a batch, plus each batch as one.
    // Setup done through `db` counts too, so read the difference around the call under test.
    requests: () => statements - batchedStatements + batches,
  };
}

type NeonBatch = Pick<import('drizzle-orm/neon-http').NeonHttpDatabase<typeof schema>, 'batch'>;
