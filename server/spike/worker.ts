// THROWAWAY spike for issue #2 (ADRs 0004, 0010, 0011). Not part of the app; delete after the write-up.
// GET /run?source=live|recorded measures fetch, parse and diff, and returns the timings.
import { neon } from '@neondatabase/serverless';
import recorded from '../fixtures/api-football/live-all-2026-10-29.json';

type ApiEvent = {
  time: { elapsed: number; extra: number | null };
  team: { id: number };
  player: { id: number | null };
  type: string;
  detail: string;
};
type ApiFixture = { fixture: { id: number }; events?: ApiEvent[] };
type Env = { DATABASE_URL: string; API_FOOTBALL_KEY: string };

// Stable identity for an event; the API gives no event id.
const eventKey = (fixtureId: number, e: ApiEvent) =>
  `${fixtureId}:${e.time.elapsed}:${e.time.extra ?? 0}:${e.team.id}:${e.player.id ?? 0}:${e.type}:${e.detail}`;

export function parseAndDiff(body: { response: ApiFixture[] }, stored: Set<string>) {
  const fresh: { key: string; fixtureId: number; type: string; detail: string }[] = [];
  for (const f of body.response) {
    for (const e of f.events ?? []) {
      const key = eventKey(f.fixture.id, e);
      if (!stored.has(key)) fresh.push({ key, fixtureId: f.fixture.id, type: e.type, detail: e.detail });
    }
  }
  return fresh;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const sql = neon(env.DATABASE_URL);
    await sql`create table if not exists spike_events (key text primary key, fixture_id int, type text, detail text)`;
    if (url.searchParams.get('reset')) await sql`truncate spike_events`;

    const t0 = Date.now();
    let text: string;
    if (url.searchParams.get('source') === 'recorded') {
      text = JSON.stringify(recorded);
    } else {
      const res = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
        headers: { 'x-apisports-key': env.API_FOOTBALL_KEY },
      });
      text = await res.text();
    }
    const t1 = Date.now();
    const body = JSON.parse(text);
    const t2 = Date.now();
    const rows = await sql`select key from spike_events`;
    const t3 = Date.now();
    const fresh = parseAndDiff(body, new Set(rows.map((r) => r.key as string)));
    const t4 = Date.now();
    if (fresh.length) {
      await sql`insert into spike_events (key, fixture_id, type, detail)
        select * from unnest(${fresh.map((x) => x.key)}::text[], ${fresh.map((x) => x.fixtureId)}::int[], ${fresh.map((x) => x.type)}::text[], ${fresh.map((x) => x.detail)}::text[])
        on conflict do nothing`;
    }
    const t5 = Date.now();
    const out = {
      bytes: text.length, fixtures: body.response.length, storedBefore: rows.length, newEvents: fresh.length,
      wallMs: { fetch: t1 - t0, parse: t2 - t1, selectStored: t3 - t2, diff: t4 - t3, insert: t5 - t4 },
    };
    console.log(JSON.stringify(out));
    return Response.json(out);
  },
};
