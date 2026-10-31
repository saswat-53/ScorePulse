import { and, eq, inArray } from 'drizzle-orm';
import { fixtureOverwrites, fixtures, standings, teamMap } from '../db/schema';
import { API_FOOTBALL_LEAGUE } from '../leagues';
import { runBatch, type PollDb, type Statement } from '../poller/db';
import { AWARDED, CANCELLED, FULL_TIME, HALFTIME, LIVE, NOT_STARTED, POSTPONED, SUSPENDED } from '../poller/status';

// The parts of a football-data.org `competitions/{code}/matches` response the sync reads.
type FdTeamRef = { id: number };
export type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  competition: { code: string };
  homeTeam: FdTeamRef;
  awayTeam: FdTeamRef;
  score: { fullTime: { home: number | null; away: number | null } };
};
export type FdMatchesResponse = { matches: FdMatch[] };

// football-data.org match status -> the API-Football short code the rest of the server uses.
const STATUS: Record<string, string> = {
  SCHEDULED: NOT_STARTED,
  TIMED: NOT_STARTED,
  IN_PLAY: LIVE,
  PAUSED: HALFTIME,
  FINISHED: FULL_TIME,
  POSTPONED: POSTPONED,
  SUSPENDED: SUSPENDED,
  CANCELLED: CANCELLED,
  AWARDED: AWARDED,
};

type Row = typeof fixtures.$inferSelect;

export async function syncFixtures(deps: { db: PollDb }, response: FdMatchesResponse) {
  const { db } = deps;
  const [teams, existing] = (await runBatch(db, [
    db.select().from(teamMap),
    db.select().from(fixtures).where(inArray(fixtures.footballDataId, response.matches.map((m) => m.id))),
  ])) as [(typeof teamMap.$inferSelect)[], Row[]];
  const apiTeamId = new Map(teams.map((t) => [t.footballDataId, t.apiFootballId]));
  const byFdId = new Map(existing.map((f) => [f.footballDataId, f]));

  const summary = { inserted: 0, updated: 0, overwritten: 0, skipped: [] as number[] };
  const writes: Statement[] = [];
  const inserts: (typeof fixtures.$inferInsert)[] = [];

  for (const match of response.matches) {
    const homeTeamId = apiTeamId.get(match.homeTeam.id);
    const awayTeamId = apiTeamId.get(match.awayTeam.id);
    const leagueId = (API_FOOTBALL_LEAGUE as Record<string, number | undefined>)[match.competition.code];
    if (homeTeamId === undefined || awayTeamId === undefined || leagueId === undefined) {
      summary.skipped.push(match.id);
      continue;
    }
    const next = {
      leagueId,
      homeTeamId,
      awayTeamId,
      kickoff: new Date(match.utcDate),
      status: STATUS[match.status] ?? NOT_STARTED,
      homeGoals: match.score.fullTime.home,
      awayGoals: match.score.fullTime.away,
    };
    const row = byFdId.get(match.id);
    if (!row) {
      inserts.push({ ...next, footballDataId: match.id, source: 'football-data' });
      summary.inserted++;
      continue;
    }
    if (row.firstPolledAt !== null) {
      // API-Football has been feeding this fixture (ADR 0003): football-data.org waits for full time.
      if (next.status !== FULL_TIME) continue;
      // Finished, but football-data.org has not filled the score in yet: keep what the poller has.
      if (next.homeGoals === null || next.awayGoals === null) continue;
      const scoreDiffers = row.homeGoals !== null && row.awayGoals !== null && (row.homeGoals !== next.homeGoals || row.awayGoals !== next.awayGoals);
      if (scoreDiffers) {
        writes.push(
          db.insert(fixtureOverwrites).values({
            fixtureId: row.id,
            oldHomeGoals: row.homeGoals,
            oldAwayGoals: row.awayGoals,
            newHomeGoals: next.homeGoals,
            newAwayGoals: next.awayGoals,
          }),
        );
        summary.overwritten++;
      }
    }
    if (differs(row, next)) {
      writes.push(db.update(fixtures).set({ ...next, updatedAt: new Date() }).where(eq(fixtures.id, row.id)));
      summary.updated++;
    }
  }
  if (inserts.length) writes.unshift(db.insert(fixtures).values(inserts));
  await runBatch(db, writes);
  return summary;
}

const differs = (row: Row, next: Partial<Row>) =>
  (Object.keys(next) as (keyof Row)[]).some((k) => (row[k] instanceof Date ? row[k].getTime() !== (next[k] as Date).getTime() : row[k] !== next[k]));


// The parts of a football-data.org `competitions/{code}/standings` response the sync reads.
export type FdStandingsResponse = {
  competition: { code: string };
  season: { startDate: string };
  standings: {
    type: string;
    table: {
      position: number;
      team: { id: number; name: string };
      playedGames: number;
      won: number;
      draw: number;
      lost: number;
      points: number;
      goalsFor: number;
      goalsAgainst: number;
    }[];
  }[];
};

// The `TOTAL` table (home and away together). Leagues have one; the Champions League league phase has one too.
export async function syncStandings(deps: { db: PollDb }, response: FdStandingsResponse) {
  const { db } = deps;
  const competition = response.competition.code;
  const season = Number(response.season.startDate.slice(0, 4));
  const table = response.standings.find((s) => s.type === 'TOTAL')?.table ?? [];

  const existing = await db.select().from(standings).where(and(eq(standings.competition, competition), eq(standings.season, season)));
  const byTeam = new Map(existing.map((r) => [r.teamId, r]));

  const summary = { inserted: 0, updated: 0 };
  const writes: Statement[] = [];
  const inserts: (typeof standings.$inferInsert)[] = [];
  for (const entry of table) {
    const next = {
      teamName: entry.team.name,
      position: entry.position,
      played: entry.playedGames,
      won: entry.won,
      drawn: entry.draw,
      lost: entry.lost,
      goalsFor: entry.goalsFor,
      goalsAgainst: entry.goalsAgainst,
      points: entry.points,
    };
    const row = byTeam.get(entry.team.id);
    if (!row) {
      inserts.push({ ...next, competition, season, teamId: entry.team.id, source: 'football-data' });
      summary.inserted++;
    } else if ((Object.keys(next) as (keyof typeof next)[]).some((k) => row[k] !== next[k])) {
      writes.push(db.update(standings).set({ ...next, updatedAt: new Date() }).where(eq(standings.id, row.id)));
      summary.updated++;
    }
  }
  if (inserts.length) writes.unshift(db.insert(standings).values(inserts));
  await runBatch(db, writes);
  return summary;
}
