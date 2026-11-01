// A demo match for checking the match screen: Everton v Brighton (2024-25), built from the recorded API-Football
// responses, shown as in play with its timeline, lineups and stats, and followed by one user so it is live-tracked.
// Every row it makes has source 'demo', so `clean` removes it (and its events, lineups, stats and follows) and
// nothing else. Needs `npm run seed:team-map` to have run. From server/:
//   npm run demo:seed [userId]    userId defaults to the only user in the database
//   npm run demo:clean
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client';
import { fixtureEvents, fixtureLineups, fixtures, fixtureStats, follows, users } from '../src/db/schema';
import { parseLineups, parseStats } from '../src/lineups-stats';
import lineupsJson from '../fixtures/api-football/lineups-everton-brighton-2024-25.json';
import statsJson from '../fixtures/api-football/statistics-everton-brighton-2024-25.json';
import varJson from '../fixtures/api-football/var-everton-brighton-2024-25.json';

const url = readFileSync('.dev.vars', 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL'))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
if (!url) throw new Error('DATABASE_URL is not in .dev.vars');
const db = getDb(url);
const [command, userArg] = process.argv.slice(2);

if (command === 'clean') {
  const removed = await db.delete(fixtures).where(eq(fixtures.source, 'demo')).returning({ id: fixtures.id });
  console.log(`removed ${removed.length} demo match(es)`);
} else if (command === 'seed') {
  const match = varJson.response[0];
  const allUsers = await db.select().from(users);
  const userId = userArg ?? (allUsers.length === 1 ? allUsers[0].id : undefined);
  if (!userId) throw new Error(`pass a user id: there are ${allUsers.length} users (${allUsers.map((u) => u.id).join(', ')})`);

  await db.delete(fixtures).where(eq(fixtures.source, 'demo')); // one demo match at a time
  const [fixture] = await db
    .insert(fixtures)
    .values({
      // Negative football-data id: it is not a real match and the nightly sync cannot touch it.
      footballDataId: -1,
      apiFootballId: match.fixture.id,
      leagueId: match.league.id,
      homeTeamId: match.teams.home.id,
      awayTeamId: match.teams.away.id,
      kickoff: new Date(Date.now() - 62 * 60_000),
      status: '2H',
      minute: 89,
      homeGoals: match.goals.home,
      awayGoals: match.goals.away,
      source: 'demo',
      firstPolledAt: new Date(),
      lastPolledAt: new Date(),
    })
    .returning();

  await db.insert(fixtureEvents).values(
    match.events.map((e) => ({
      fixtureId: fixture.id,
      elapsed: e.time.elapsed,
      extra: e.time.extra,
      teamId: e.team.id,
      playerId: e.player.id,
      playerName: e.player.name,
      assistName: e.assist?.name ?? null,
      type: e.type,
      detail: e.detail,
    })),
  ).onConflictDoNothing();
  await db.insert(fixtureLineups).values(parseLineups(lineupsJson).map((l) => ({ fixtureId: fixture.id, ...l })));
  await db.insert(fixtureStats).values(parseStats(statsJson).map((s) => ({ fixtureId: fixture.id, ...s, phase: 'HT' as const })));
  await db.insert(follows).values({ userId, fixtureId: fixture.id }).onConflictDoNothing();
  console.log(`demo match ${fixture.id}: Everton ${match.goals.home}-${match.goals.away} Brighton, followed by ${userId}`);
} else {
  console.log('usage: demo-match.ts seed [userId] | clean');
}
