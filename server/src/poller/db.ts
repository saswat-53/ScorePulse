import type { BatchItem } from 'drizzle-orm/batch';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';

// The Neon HTTP driver in the Worker. Tests pass PGlite with a `batch` that runs the statements in order.
export type PollDb = PgDatabase<PgQueryResultHKT, typeof schema> & Pick<NeonHttpDatabase<typeof schema>, 'batch'>;
export type Statement = BatchItem<'pg'>;

// Many statements in one Neon HTTP request (one subrequest, one round trip, one transaction): a request costs CPU, a statement barely does.
export async function runBatch(db: PollDb, statements: Statement[]): Promise<unknown[]> {
  if (statements.length === 0) return [];
  return db.batch(statements as [Statement, ...Statement[]]);
}
