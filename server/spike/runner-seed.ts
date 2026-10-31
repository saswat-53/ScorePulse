// THROWAWAY: seeds (or with `clean`, removes) the rows the runner spike needs: a user, the 3 matches as followed fixtures.
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { inArray } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import recorded from '../fixtures/api-football/live-all-2026-10-29.json';

const url = readFileSync('.dev.vars', 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL ='))!.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const db = drizzle(neon(url), { schema });
const matches = recorded.response.filter((m) => ['1H', '2H'].includes(m.fixture.status.short) && m.events.some((e) => e.type === 'Goal')).slice(0, 3);
const ids = matches.map((m) => m.fixture.id);

if (process.argv[2] === 'clean') {
  await db.delete(schema.fixtures).where(inArray(schema.fixtures.apiFootballId, ids)); // cascades events and follows
  await db.delete(schema.users).where(inArray(schema.users.id, ['spike_user']));
  await db.delete(schema.pollState);
  console.log('cleaned');
} else {
  await db.insert(schema.users).values({ id: 'spike_user' }).onConflictDoNothing();
  const rows = await db
    .insert(schema.fixtures)
    .values(
      matches.map((m) => ({
        apiFootballId: m.fixture.id, leagueId: m.league.id, homeTeamId: m.teams.home.id, awayTeamId: m.teams.away.id,
        kickoff: new Date(Date.now() - 50 * 60_000), status: '2H', source: 'api-football', firstPolledAt: new Date(),
      })),
    )
    .onConflictDoNothing()
    .returning();
  await db.insert(schema.follows).values(rows.map((r) => ({ userId: 'spike_user', fixtureId: r.id }))).onConflictDoNothing();
  console.log('seeded', rows.length, 'fixtures; league ids', matches.map((m) => m.league.id), 'events', matches.map((m) => m.events.length));
}
