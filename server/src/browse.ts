import { alias } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, gte, inArray, lt, type SQL } from 'drizzle-orm';
import { fixtures, standings, teamMap } from './db/schema';
import { API_FOOTBALL_LEAGUE, leagueCodeOf, type LeagueCode } from './leagues';
import type { PollDb } from './poller/db';
import { hasFavorite, hasFollow } from './poller/run-poller';
import { HALFTIME, IN_PLAY } from './poller/status';

// The app's `Fixture` and `Team` (app/src/domain/types.ts), built from what the sync and the poller stored.
type FixtureStatus = 'scheduled' | 'live' | 'halftime' | 'finished' | 'postponed' | 'cancelled';

// Stored status is an API-Football short code (the sync maps football-data.org's onto it).
const STATUS: Record<string, FixtureStatus> = {
  NS: 'scheduled',
  '1H': 'live',
  '2H': 'live',
  ET: 'live',
  BT: 'live',
  P: 'live',
  LIVE: 'live',
  HT: 'halftime',
  FT: 'finished',
  AET: 'finished',
  PEN: 'finished',
  AWD: 'finished',
  PST: 'postponed',
  SUSP: 'postponed',
  CANC: 'cancelled',
};
const IN_PLAY_STATUSES = [...IN_PLAY, HALFTIME];

const home = alias(teamMap, 'home_team');
const away = alias(teamMap, 'away_team');

const teamJson = (t: typeof teamMap.$inferSelect) => ({
  id: t.apiFootballId,
  name: t.name,
  shortName: t.shortName,
  code: t.code,
  crestUrl: t.crestUrl,
});

export async function listFixtures(
  db: PollDb,
  query: { from: Date; to: Date; league?: LeagueCode; inPlayOnly?: boolean },
  // True while the poll interval has widened: a follow-only match then shows as paused (ADR 0013).
  quotaLow: boolean,
) {
  const where: (SQL | undefined)[] = [gte(fixtures.kickoff, query.from), lt(fixtures.kickoff, query.to)];
  if (query.league) where.push(eq(fixtures.leagueId, API_FOOTBALL_LEAGUE[query.league]));
  if (query.inPlayOnly) where.push(inArray(fixtures.status, IN_PLAY_STATUSES));

  const rows = await db
    .select({ fixture: fixtures, home, away, favorite: hasFavorite.as('favorite'), followed: hasFollow.as('followed') })
    .from(fixtures)
    .innerJoin(home, eq(home.apiFootballId, fixtures.homeTeamId))
    .innerJoin(away, eq(away.apiFootballId, fixtures.awayTeamId))
    .where(and(...where))
    .orderBy(asc(fixtures.kickoff), asc(fixtures.id));

  return rows.map(({ fixture: f, home: h, away: a, favorite, followed }) => ({
    id: f.id,
    leagueId: leagueCodeOf(f.leagueId),
    round: null,
    kickoffUtc: f.kickoff.toISOString(),
    status: STATUS[f.status] ?? 'scheduled',
    minute: null,
    home: teamJson(h),
    away: teamJson(a),
    score: { home: f.homeGoals, away: f.awayGoals },
    venue: null,
    tracking: favorite || followed ? 'live' : 'snapshot',
    // Only a match being polled can be paused: a follow ends at full time and a future match is not polled yet.
    paused: quotaLow && followed && !favorite && IN_PLAY_STATUSES.includes(f.status),
    updatedAt: f.updatedAt.toISOString(),
    source: f.source,
  }));
}

const CHAMPIONS_LEAGUE_PLACES = 4;

// "2026" -> "2026/27"
const seasonLabel = (startYear: number) => `${startYear}/${String(startYear + 1).slice(2)}`;

// The newest stored table of a league. A team that is not in team_map has no API-Football id, so it gets the
// negative of its football-data.org id: it shows, and cannot be mistaken for a real team (or a favorite).
export async function getStandings(db: PollDb, league: LeagueCode) {
  const rows = await db
    .select({ standing: standings, team: teamMap })
    .from(standings)
    .leftJoin(teamMap, eq(teamMap.footballDataId, standings.teamId))
    .where(eq(standings.competition, league))
    .orderBy(desc(standings.season), asc(standings.position));
  const season = rows[0]?.standing.season;
  const current = rows.filter((r) => r.standing.season === season);

  return {
    leagueId: league,
    season: season === undefined ? '' : seasonLabel(season),
    rows: current.map(({ standing: s, team }) => ({
      position: s.position,
      team: team ? teamJson(team) : { id: -s.teamId, name: s.teamName, shortName: s.teamName, code: s.teamName.slice(0, 3).toUpperCase(), crestUrl: null },
      played: s.played,
      won: s.won,
      drawn: s.drawn,
      lost: s.lost,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      goalDifference: s.goalsFor - s.goalsAgainst,
      points: s.points,
      zone: league !== 'CL' && s.position <= CHAMPIONS_LEAGUE_PLACES ? ('champions-league' as const) : null,
    })),
    updatedAt: current.length ? new Date(Math.max(...current.map((r) => r.standing.updatedAt.getTime()))).toISOString() : null,
    source: current[0]?.standing.source ?? 'football-data',
  };
}
