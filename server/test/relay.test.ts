import { expect, test } from 'vitest';
import { handle } from '../../relay/api/[...path]';

type Call = { url: string; key: string | null };

const upstream = (calls: Call[]) =>
  (async (url: string, init: RequestInit) => {
    calls.push({ url, key: new Headers(init.headers).get('x-apisports-key') });
    return new Response('{"errors":[],"response":[]}', { status: 200, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '9', 'set-cookie': 'a=b' } });
  }) as unknown as typeof fetch;

test('relay: forwards an allowed path, query and key, and returns the rate-limit headers only', async () => {
  const calls: Call[] = [];
  const res = await handle(new Request('https://relay.example/api/fixtures?live=78-78', { headers: { 'x-apisports-key': 'k' } }), upstream(calls));
  expect(calls).toEqual([{ url: 'https://v3.football.api-sports.io/fixtures?live=78-78', key: 'k' }]);
  expect(res.status).toBe(200);
  expect(res.headers.get('x-ratelimit-remaining')).toBe('9');
  expect(res.headers.get('set-cookie')).toBeNull();
  expect(res.headers.get('x-relay')).toBe('1');
});

test('relay: drops the ...path parameter Vercel adds to the query', async () => {
  const calls: Call[] = [];
  await handle(new Request('https://relay.example/api/fixtures/lineups?fixture=7&...path=fixtures%2Flineups', { headers: { 'x-apisports-key': 'k' } }), upstream(calls));
  expect(calls[0].url).toBe('https://v3.football.api-sports.io/fixtures/lineups?fixture=7');
});

test('relay: refuses other paths, other methods and a missing key without calling API-Football', async () => {
  const calls: Call[] = [];
  const h = { 'x-apisports-key': 'k' };
  expect((await handle(new Request('https://relay.example/api/status', { headers: h }), upstream(calls))).status).toBe(404);
  expect((await handle(new Request('https://relay.example/api/fixtures', { method: 'POST', headers: h }), upstream(calls))).status).toBe(404);
  expect((await handle(new Request('https://relay.example/api/fixtures'), upstream(calls))).status).toBe(401);
  expect(calls).toEqual([]);
});

test('relay: passes a refusal through as it came', async () => {
  const refused = (() => Promise.resolve(new Response('{"errors":{"rateLimit":"x"}}', { status: 429 }))) as unknown as typeof fetch;
  const res = await handle(new Request('https://relay.example/api/fixtures?live=1-1', { headers: { 'x-apisports-key': 'k' } }), refused);
  expect(res.status).toBe(429);
});
