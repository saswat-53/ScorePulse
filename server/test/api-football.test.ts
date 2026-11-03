import { expect, test } from 'vitest';
import { liveLeagues } from '../src/poller/api-football';

// API-Football rejects `live=2` with an error body and a 200, which reads as "nothing is live". Ids must be joined by
// a dash, so a single league is written twice.
test('a single league is written as two ids, which the live filter accepts', () => {
  expect(liveLeagues([2])).toBe('2-2');
  expect(liveLeagues([39, 140])).toBe('39-140');
});
