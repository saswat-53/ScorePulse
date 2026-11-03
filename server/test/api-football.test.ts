import { expect, test, vi } from 'vitest';
import { apiFootball, liveLeagues } from '../src/poller/api-football';
import { RateLimited } from '../src/poller/rate-limit';

// API-Football rejects `live=2` with an error body and a 200, which reads as "nothing is live". Ids must be joined by
// a dash, so a single league is written twice.
test('a single league is written as two ids, which the live filter accepts', () => {
  expect(liveLeagues([2])).toBe('2-2');
  expect(liveLeagues([39, 140])).toBe('39-140');
});

test('an answer with an error in its body is logged, since the 200 hides it', async () => {
  const logged: string[] = [];
  const fail = vi.spyOn(console, 'error').mockImplementation((m: string) => void logged.push(m));
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ errors: { rateLimit: 'Too many requests' }, response: [] }) }));

  await expect(apiFootball('key').fetchLive([2])).rejects.toBeInstanceOf(RateLimited);

  expect(logged.join()).toMatch(/fixtures\?live=2-2.*rateLimit/);
  fail.mockRestore();
  vi.unstubAllGlobals();
});

test('another error in the body is logged and the answer is returned as it came', async () => {
  const fail = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ errors: { token: 'Error/Missing application key' }, response: [] }) }));

  await expect(apiFootball('key').fetchLive([2])).resolves.toMatchObject({ response: [] });

  expect(fail).toHaveBeenCalledOnce();
  fail.mockRestore();
  vi.unstubAllGlobals();
});

test('an answer with no errors logs nothing', async () => {
  const fail = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ errors: [], response: [] }) }));

  await apiFootball('key').fetchLive([2, 39]);

  expect(fail).not.toHaveBeenCalled();
  fail.mockRestore();
  vi.unstubAllGlobals();
});
