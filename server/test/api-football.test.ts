import { expect, test, vi } from 'vitest';
import { apiFootball, liveLeagues, msUntilSettled } from '../src/poller/api-football';
import { RateLimited } from '../src/poller/rate-limit';

// No real waiting in tests: the pauses are recorded instead.
const quick = (extra: Parameters<typeof apiFootball>[1] = {}) => ({ retryMs: 0, gapMs: 0, sleep: async () => undefined, now: () => new Date('2026-11-03T22:06:21.345Z'), ...extra });

// API-Football rejects `live=2` with an error body and a 200, which reads as "nothing is live". Ids must be joined by
// a dash, so a single league is written twice.
test('a single league is written as two ids, which the live filter accepts', () => {
  expect(liveLeagues([2])).toBe('2-2');
  expect(liveLeagues([39, 140])).toBe('39-140');
});

test('an answer with an error in its body is logged, since the 200 hides it', async () => {
  const logged: string[] = [];
  const fail = vi.spyOn(console, 'error').mockImplementation((m: string) => void logged.push(m));
  vi.stubGlobal('fetch', async () => ({ ok: true, headers: new Headers(), json: async () => ({ errors: { rateLimit: 'Too many requests' }, response: [] }) }));

  await expect(apiFootball('key', quick()).fetchLive([2])).rejects.toBeInstanceOf(RateLimited);

  expect(logged.join()).toMatch(/fixtures\?live=2-2.*rateLimit/);
  fail.mockRestore();
  vi.unstubAllGlobals();
});

test('another error in the body is logged and the answer is returned as it came', async () => {
  const fail = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', async () => ({ ok: true, headers: new Headers(), json: async () => ({ errors: { token: 'Error/Missing application key' }, response: [] }) }));

  await expect(apiFootball('key', quick()).fetchLive([2])).resolves.toMatchObject({ response: [] });

  expect(fail).toHaveBeenCalledOnce();
  fail.mockRestore();
  vi.unstubAllGlobals();
});

test('an answer with no errors logs nothing', async () => {
  const fail = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', async () => ({ ok: true, headers: new Headers(), json: async () => ({ errors: [], response: [] }) }));

  await apiFootball('key', quick()).fetchLive([2, 39]);

  expect(fail).not.toHaveBeenCalled();
  fail.mockRestore();
  vi.unstubAllGlobals();
});

test('every request logs what is left of the day and the minute, so a refusal can be compared with the line before it', async () => {
  const logged: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((m: string) => void logged.push(m));
  const headers = new Headers({ 'x-ratelimit-requests-remaining': '71', 'x-ratelimit-remaining': '9' });
  vi.stubGlobal('fetch', async () => ({ ok: true, headers, json: async () => ({ errors: [], response: [] }) }));

  await apiFootball('key', quick()).fetchLive([2, 39]);

  expect(logged).toEqual(['API-Football fixtures?live=2-39: 71 left today, 9 left this minute at 22:06:21.345']);
  log.mockRestore();
  vi.unstubAllGlobals();
});

test('a refusal logs the same counts, and a missing header shows as a question mark', async () => {
  const logged: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((m: string) => void logged.push(m));
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const headers = new Headers({ 'x-ratelimit-requests-remaining': '70' });
  vi.stubGlobal('fetch', async () => ({ ok: true, headers, json: async () => ({ errors: { rateLimit: 'x' }, response: [] }) }));

  await expect(apiFootball('key', quick()).fetchLive([2])).rejects.toBeInstanceOf(RateLimited);

  // The request and its retry, each logged.
  expect(logged).toEqual(Array(2).fill('API-Football fixtures?live=2-2: 70 left today, ? left this minute at 22:06:21.345'));
  log.mockRestore();
  err.mockRestore();
  vi.unstubAllGlobals();
});

// A refusal for rate limit is retried once after a pause, inside the same run; two in a row end the run (RateLimited).
test('a request refused for rate limit is tried once more after a pause, and the second answer is used', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const answers = [{ errors: { rateLimit: 'x' }, response: [] }, { errors: [], response: [{ fixture: { id: 7 } }] }];
  const fetchMock = vi.fn(async () => ({ ok: true, headers: new Headers(), json: async () => answers.shift() }));
  vi.stubGlobal('fetch', fetchMock);

  const res = await apiFootball('key', quick()).fetchLive([2, 39]);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(res.response).toHaveLength(1);
  err.mockRestore();
  log.mockRestore();
  vi.unstubAllGlobals();
});

test('two refusals in a row end in RateLimited, after exactly two requests', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const fetchMock = vi.fn(async () => ({ ok: true, headers: new Headers(), json: async () => ({ errors: { rateLimit: 'x' }, response: [] }) }));
  vi.stubGlobal('fetch', fetchMock);

  await expect(apiFootball('key', quick()).fetchLive([2, 39])).rejects.toBeInstanceOf(RateLimited);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  err.mockRestore();
  log.mockRestore();
  vi.unstubAllGlobals();
});

// The Worker's run starts at :58, the last seconds of a minute, where its first requests were mostly refused. A run
// waits until a few seconds into the next minute, and spaces its requests a second apart.
test('a first request in the last seconds of a minute, or the first seconds of the next, waits until 3 seconds past', () => {
  const at = (time: string) => new Date(`2026-11-03T${time}Z`);
  expect(msUntilSettled(at('22:05:58.500'))).toBe(4500);
  expect(msUntilSettled(at('22:05:55.000'))).toBe(8000);
  expect(msUntilSettled(at('22:06:01.000'))).toBe(2000);
  expect(msUntilSettled(at('22:06:03.000'))).toBe(0);
  expect(msUntilSettled(at('22:06:20.000'))).toBe(0);
  expect(msUntilSettled(at('22:05:54.900'))).toBe(0);
});

test('the first request of a run waits for the settled second, and later ones are a second apart', async () => {
  const pauses: number[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', async () => ({ ok: true, headers: new Headers(), json: async () => ({ errors: [], response: [] }) }));
  const provider = apiFootball('key', quick({ gapMs: 1000, now: () => new Date('2026-11-03T22:05:58.500Z'), sleep: async (ms) => void pauses.push(ms) }));

  await provider.fetchLive([2, 39]);
  await provider.fetchFixture(1);
  await provider.fetchLineups(1);

  expect(pauses).toEqual([4500, 1000, 1000]);
  log.mockRestore();
  vi.unstubAllGlobals();
});

test('a request made a second or more after the one before it does not wait', async () => {
  const pauses: number[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', async () => ({ ok: true, headers: new Headers(), json: async () => ({ errors: [], response: [] }) }));
  let ms = Date.parse('2026-11-03T22:06:10.000Z');
  const provider = apiFootball('key', quick({ gapMs: 1000, now: () => new Date((ms += 1500)), sleep: async (n) => void pauses.push(n) }));

  await provider.fetchLive([2, 39]);
  await provider.fetchFixture(1);

  expect(pauses).toEqual([]);
  log.mockRestore();
  vi.unstubAllGlobals();
});
