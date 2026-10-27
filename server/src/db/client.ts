import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// HTTP driver: one fetch per query, no connection to keep alive between invocations.
// Each query counts as one subrequest against the Workers limit of 50 per invocation.
export function getDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema });
}

export type Db = ReturnType<typeof getDb>;
