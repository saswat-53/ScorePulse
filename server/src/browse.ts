import { alias } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, gte, inArray, isNull, lt, type SQL } from 'drizzle-orm';
import { fixtureEvents, fixtures, follows, standings, teamMap } from './db/schema';
import { API_FOOTBALL_LEAGUE, leagueCodeOf, type LeagueCode } from './leagues';
import { runBatch, type PollDb } from './poller/db';
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

const selectFixtures = (db: PollDb, where: (SQL | undefined)[]) =>
  db
    .select({ fixture: fixtures, home, away, favorite: hasFavorite.as('favorite'), followed: hasFollow.as('followed') })
    .from(fixtures)
    .innerJoin(home, eq(home.apiFootballId, fixtures.homeTeamId))
    .innerJoin(away, eq(away.apiFootballId, fixtures.awayTeamId))
    .where(and(...where))
    .orderBy(asc(fixtures.kickoff), asc(fixtures.id));

type FixtureRow = Awaited<ReturnType<typeof selectFixtures>>[number];

// `quotaLow`: the poll interval has widened, so a follow-only match in play shows as paused (ADR 0013).
const toFixture = ({ fixture: f, home: h, away: a, favorite, followed }: FixtureRow, quotaLow: boolean) => ({
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
  tracking: favorite || followed ? ('live' as const) : ('snapshot' as const),
  // Only a match being polled can be paused: a follow ends at full time and a future match is not polled yet.
  paused: quotaLow && followed && !favorite && IN_PLAY_STATUSES.includes(f.status),
  updatedAt: f.updatedAt.toISOString(),
  source: f.source,
});

export async function listFixtures(
  db: PollDb,
  query: { from: Date; to: Date; league?: LeagueCode; inPlayOnly?: boolean },
  quotaLow: boolean,
) {
  const where: (SQL | undefined)[] = [gte(fixtures.kickoff, query.from), lt(fixtures.kickoff, query.to)];
  if (query.league) where.push(eq(fixtures.leagueId, API_FOOTBALL_LEAGUE[query.league]));
  if (query.inPlayOnly) where.push(inArray(fixtures.status, IN_PLAY_STATUSES));
  return (await selectFixtures(db, where)).map((row) => toFixture(row, quotaLow));
}

// Timeline events as the app shows them. "Goal" covers a missed penalty too (no score); VAR rows are not shown
// until VAR wording is confirmed on real matches (docs/deferred.md).
interface TimelineEvent {
  id: string;
  minute: number;
  extra: number | null;
  teamId: number;
  type: 'goal' | 'card' | 'substitution';
  detail: string;
  player: string;
  related: string | null;
  scoreAfter: { home: number; away: number } | null;
  removed: boolean;
}

const GOAL_DETAIL: Record<string, string> = {
  'Normal Goal': 'normal-goal',
  Penalty: 'penalty',
  'Own Goal': 'own-goal',
  'Missed Penalty': 'missed-penalty',
};
const CARD_DETAIL: Record<string, string> = { 'Yellow Card': 'yellow-card', 'Red Card': 'red-card' };

// A match with its timeline. A match nobody tracks has no stored events, so its timeline is empty: the app shows
// it locked ("not live-tracked, tap Follow") from `tracking`. Lineups and statistics are #11.
export async function getMatch(db: PollDb, id: number, userId: string, quotaLow: boolean) {
  const [row] = await selectFixtures(db, [eq(fixtures.id, id)]);
  if (!row) return null;
  const [rows, followRows] = (await runBatch(db, [
    db.select().from(fixtureEvents).where(and(eq(fixtureEvents.fixtureId, id), isNull(fixtureEvents.removedAt))),
    db.select().from(follows).where(and(eq(follows.fixtureId, id), eq(follows.userId, userId))),
  ])) as [(typeof fixtureEvents.$inferSelect)[], unknown[]];

  const ordered = [...rows].sort((a, b) => a.elapsed - b.elapsed || (a.extra ?? 0) - (b.extra ?? 0) || a.id - b.id);
  // The score after each goal, from the goals still standing. The API credits an own goal to the side that gains it.
  const score = { home: 0, away: 0 };
  const events = ordered.flatMap<TimelineEvent>((e) => {
    const base = {
      id: `${e.fixtureId}:${e.elapsed}:${e.extra ?? 0}:${e.teamId}:${e.playerId ?? 0}:${e.type}:${e.detail}`,
      minute: e.elapsed,
      extra: e.extra,
      teamId: e.teamId,
      player: e.playerName ?? '',
      related: e.assistName,
      scoreAfter: null,
      removed: false,
    };
    if (e.type === 'Goal' && GOAL_DETAIL[e.detail]) {
      if (e.detail !== 'Missed Penalty') {
        if (e.teamId === row.fixture.homeTeamId) score.home++;
        else score.away++;
      }
      const scoreAfter = e.detail === 'Missed Penalty' ? null : { ...score };
      return [{ ...base, type: 'goal', detail: GOAL_DETAIL[e.detail], scoreAfter }];
    }
    if (e.type === 'Card' && CARD_DETAIL[e.detail]) return [{ ...base, type: 'card', detail: CARD_DETAIL[e.detail] }];
    // The player who goes off is `player`, the one who comes on is the "assist" (API-Football's wording).
    if (e.type === 'subst') return [{ ...base, type: 'substitution', detail: 'substitution' }];
    return [];
  });

  return { ...toFixture(row, quotaLow), events, lineups: null, stats: null, followed: followRows.length > 0 };
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
