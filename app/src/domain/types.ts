/**
 * The app's data contract: one normalized shape for both football providers.
 *
 * API-Football and football-data.org name the same facts differently (team crest vs logo,
 * `score.fullTime` vs `goals`, `FINISHED` vs `FT`). The server adapters map each provider into
 * these types, so the screens never see provider vocabulary. Mock data in `mock.ts` follows the
 * same types, so wiring a screen to the real API later is a swap, not a rewrite.
 *
 * Shapes here are written from the providers' documented responses and are not yet checked
 * against recorded responses. The spike (issue #2) records real ones to confirm.
 */

/** Which provider supplied a row. Mirrors the `source` column on mirrored tables. */
export type Source = 'api-football' | 'football-data';

export type LeagueId = 'CL' | 'PL' | 'PD' | 'FL1' | 'BL1';

export interface League {
  id: LeagueId;
  name: string;
  shortName: string;
}

export interface Team {
  /** Our own id. `team_map` links it to each provider's team id. */
  id: number;
  name: string;
  shortName: string;
  /** Three-letter code, for example MCI. football-data.org calls it `tla`. */
  code: string;
  crestUrl: string | null;
  /** Ring colour used when there is no crest image. */
  color: string;
}

/**
 * API-Football short codes (NS, 1H, HT, 2H, FT, AET, PEN, PST, CANC...) and football-data.org
 * statuses (SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED, POSTPONED, CANCELLED...) both map here.
 */
export type FixtureStatus =
  | 'scheduled'
  | 'live'
  | 'halftime'
  | 'finished'
  | 'postponed'
  | 'cancelled';

export interface Score {
  home: number | null;
  away: number | null;
}

/** `live`: the poller reads this fixture. `snapshot`: only saved data (see GLOSSARY.md). */
export type Tracking = 'live' | 'snapshot';

export interface Fixture {
  id: number;
  leagueId: LeagueId;
  round: string | null;
  kickoffUtc: string;
  status: FixtureStatus;
  /** Elapsed minute while live. */
  minute: number | null;
  home: Team;
  away: Team;
  score: Score;
  venue: string | null;
  tracking: Tracking;
  /** True when the polling interval has widened and live data is arriving less often. */
  paused: boolean;
  /** When the stored data last changed. */
  updatedAt: string;
  source: Source;
}

export type EventType = 'goal' | 'card' | 'substitution' | 'var';

export type EventDetail =
  | 'normal-goal'
  | 'penalty'
  | 'own-goal'
  | 'missed-penalty'
  | 'yellow-card'
  | 'red-card'
  | 'substitution'
  | 'goal-cancelled';

/**
 * API-Football events have no id, so the id is the composite dedupe key
 * (fixture, minute, extra minute, team, player, type, detail).
 */
export interface MatchEvent {
  id: string;
  minute: number;
  extra: number | null;
  teamId: number;
  type: EventType;
  detail: EventDetail;
  player: string;
  /** Assist for a goal, or the player coming on for a substitution. */
  related: string | null;
  /** Score after this goal. Null for other events. */
  scoreAfter: Score | null;
  /** Set when a goal was cancelled (`removed_at`). Removed events are hidden in the timeline. */
  removed: boolean;
}

export type Position = 'G' | 'D' | 'M' | 'F';

export interface LineupPlayer {
  id: number;
  name: string;
  number: number;
  position: Position;
  /** API-Football grid "row:column", row 1 is the goalkeeper. Null for substitutes. */
  grid: string | null;
}

export interface Lineup {
  teamId: number;
  formation: string | null;
  coach: string | null;
  starters: LineupPlayer[];
  substitutes: LineupPlayer[];
}

export interface StatRow {
  key: string;
  label: string;
  home: number;
  away: number;
  unit: '%' | null;
}

/** football-data.org has no events, lineups or stats on the free plan, so these are optional. */
export interface MatchDetail extends Fixture {
  events: MatchEvent[];
  lineups: Lineup[] | null;
  stats: StatRow[] | null;
  /** Whether the signed-in user follows this match. */
  followed: boolean;
}

export interface StandingRow {
  position: number;
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Highlighted qualification zone, if any. */
  zone: 'champions-league' | null;
}

export interface Standings {
  leagueId: LeagueId;
  season: string;
  rows: StandingRow[];
  updatedAt: string;
  source: Source;
}

export interface AlertSettings {
  goals: boolean;
  cards: boolean;
  substitutions: boolean;
  kickoff: boolean;
  fullTime: boolean;
}

export interface Profile {
  name: string;
  email: string;
  avatarUrl: string | null;
  favoriteTeamIds: number[];
  alerts: AlertSettings;
}

/** Exposed by the API. The app checks both at launch (ADR 0007). */
export interface VersionConfig {
  minAppVersion: string;
  latestAppVersion: string;
  /** The Vercel showcase page, never the Drive link (ADR 0006). */
  downloadPageUrl: string;
}

export const MAX_FAVORITES = 3;
