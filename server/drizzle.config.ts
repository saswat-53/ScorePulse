import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Migrations use the DIRECT Neon connection (not the pooler); the Worker uses the pooled one at runtime.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT!,
  },
});
