// A snapshot fixture comes from football-data.org with no API-Football id, so the poller cannot match it to the live
// response (#22). This links it from that response, with no extra request: the live match carries the league, both
// team ids (the ones fixtures already store) and its scheduled kickoff. Only an exact, unambiguous match is linked;
// anything else is reported and left alone, never guessed.

// A kickoff moved by the league since the snapshot still matches within this window.
const KICKOFF_WINDOW_MS = 2 * 3_600_000;

export type LinkCandidate = { id: number; leagueId: number; homeTeamId: number; awayTeamId: number; kickoff: Date };
type LiveMatch = { fixture: { id: number; date?: string }; league?: { id: number }; teams?: { home: { id: number }; away: { id: number } } };

export function planLinks(candidates: LinkCandidate[], live: LiveMatch[]) {
  const fits = (f: LinkCandidate, m: LiveMatch) =>
    m.league?.id === f.leagueId &&
    m.teams?.home.id === f.homeTeamId &&
    m.teams?.away.id === f.awayTeamId &&
    m.fixture.date !== undefined &&
    Math.abs(new Date(m.fixture.date).getTime() - f.kickoff.getTime()) <= KICKOFF_WINDOW_MS;

  const links: { fixtureId: number; apiFootballId: number }[] = [];
  const unmatched: number[] = [];
  const ambiguous = new Set<number>();

  for (const f of candidates) {
    const matches = live.filter((m) => fits(f, m));
    if (matches.length === 0) unmatched.push(f.id);
    else if (matches.length > 1) ambiguous.add(f.id);
  }
  // A live match two fixtures both fit cannot be given to either.
  for (const m of live) {
    const rivals = candidates.filter((f) => fits(f, m));
    if (rivals.length > 1) rivals.forEach((f) => ambiguous.add(f.id));
  }
  for (const f of candidates) {
    if (ambiguous.has(f.id)) continue;
    const match = live.find((m) => fits(f, m));
    if (match) links.push({ fixtureId: f.id, apiFootballId: match.fixture.id });
  }
  return { links, unmatched, ambiguous: [...ambiguous] };
}
