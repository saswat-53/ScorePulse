// Node proxy for Worker CPU: parse + diff of the recorded response, cold then warm. Run: npx tsx spike/cpu.ts
import { readFileSync } from 'node:fs';
import { parseAndDiff } from './worker';
const text = readFileSync('fixtures/api-football/live-all-2026-10-29.json', 'utf8');
const run = () => {
  const c = process.cpuUsage(); const t = performance.now();
  const body = JSON.parse(text);
  const fresh = parseAndDiff(body, new Set());
  const u = process.cpuUsage(c);
  return { events: fresh.length, cpuMs: (u.user + u.system) / 1000, wallMs: performance.now() - t };
};
for (let i = 0; i < 5; i++) console.log(i === 0 ? 'cold' : 'warm', run());

// Scale to the ~4 MB weekend peak by repeating fixtures (distinct ids) to see the worst case.
const base = JSON.parse(text);
const big = { response: Array.from({ length: 90 }, (_, i) => base.response.map((f: any) => ({ ...f, fixture: { ...f.fixture, id: f.fixture.id + i * 1e7 } }))).flat() };
const bigText = JSON.stringify(big);
for (let i = 0; i < 4; i++) {
  const c = process.cpuUsage();
  const fresh = parseAndDiff(JSON.parse(bigText), new Set());
  const u = process.cpuUsage(c);
  console.log('peak', (bigText.length / 1e6).toFixed(1) + 'MB', { events: fresh.length, cpuMs: (u.user + u.system) / 1000 });
}
