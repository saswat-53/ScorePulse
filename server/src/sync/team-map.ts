// Links a team's id at football-data.org to its id at API-Football (`team_map`). The two providers name clubs
// differently ("Brighton & Hove Albion FC" / "Brighton"), so the match is by name, and anything unsure is left
// unmatched for a human to link with an override. A wrong link is worse than a missing one: it would put one club's
// alerts on another's fixtures. So no match is made from a three-letter code, which collides across clubs.

import { sql } from 'drizzle-orm';
import { teamMap } from '../db/schema';
import type { PollDb } from '../poller/db';

export type FdTeam = { id: number; name: string; shortName: string; tla: string; crest?: string | null };
export type AfTeam = { id: number; name: string };
export type TeamPair = { footballDataId: number; apiFootballId: number };

// Words that say what kind of club it is, not which club: dropped before comparing names.
const NOISE = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'as', 'rc', 'ssc', 'sv', 'vfl', 'fsv', 'tsg', 'rb', 'ud', 'cd', 'real', 'club', 'de', 'hove', 'albion', 'and']);

const words = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    // Founding years and numbers ("1. FC Köln", "Stade Rennais FC 1901") are not part of the name either way.
    .filter((w) => w !== '' && !NOISE.has(w) && !/^\d+$/.test(w));

const key = (name: string) => words(name).join(' ');

export function matchTeams(fdTeams: FdTeam[], afTeams: AfTeam[], overrides: Record<number, number> = {}) {
  const pairs: TeamPair[] = [];
  const unmatched: FdTeam[] = [];
  const used = new Set<number>();

  const byName = new Map<string, AfTeam[]>();
  for (const t of afTeams) byName.set(key(t.name), [...(byName.get(key(t.name)) ?? []), t]);

  const only = <T>(candidates: T[]) => (candidates.length === 1 ? candidates[0] : undefined);

  function find(team: FdTeam): number | undefined {
    if (overrides[team.id] !== undefined) return overrides[team.id];
    const exact = [team.name, team.shortName].map((n) => only(byName.get(key(n)) ?? [])).find((t) => t !== undefined);
    if (exact) return exact.id;
    // Every word of the API-Football name appears in the football-data.org names: "Leeds" in "Leeds United FC".
    const ours = new Set([...words(team.name), ...words(team.shortName)]);
    const contained = afTeams.filter((t) => {
      const theirs = words(t.name);
      return theirs.length > 0 && theirs.every((w) => ours.has(w));
    });
    return only(contained)?.id;
  }

  for (const team of fdTeams) {
    const apiFootballId = find(team);
    if (apiFootballId === undefined || used.has(apiFootballId)) unmatched.push(team);
    else {
      used.add(apiFootballId);
      pairs.push({ footballDataId: team.id, apiFootballId });
    }
  }
  return { pairs, unmatched };
}

// Stores the links and refreshes what the picker shows. Safe to run again.
export async function saveTeamMap(db: PollDb, pairs: TeamPair[], fdTeams: FdTeam[]) {
  if (pairs.length === 0) return;
  const byId = new Map(fdTeams.map((t) => [t.id, t]));
  await db
    .insert(teamMap)
    .values(
      pairs.map((p) => {
        const team = byId.get(p.footballDataId);
        return { ...p, name: team?.name ?? '', shortName: team?.shortName ?? '', code: team?.tla ?? '', crestUrl: team?.crest ?? null };
      }),
    )
    .onConflictDoUpdate({
      target: teamMap.footballDataId,
      set: {
        name: sql`excluded.name`,
        shortName: sql`excluded.short_name`,
        code: sql`excluded.code`,
        crestUrl: sql`excluded.crest_url`,
      },
    });
}
