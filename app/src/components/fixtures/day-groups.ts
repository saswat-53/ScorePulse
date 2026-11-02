import type { Fixture } from '@/domain/types';
import { dateKey } from '@/lib/dates';

/** Consecutive fixtures that kick off on the same local day, in the order given. */
export function groupByDay(fixtures: Fixture[]): { key: string; kickoffUtc: string; fixtures: Fixture[] }[] {
  const groups: { key: string; kickoffUtc: string; fixtures: Fixture[] }[] = [];
  for (const f of fixtures) {
    const key = dateKey(f.kickoffUtc);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.fixtures.push(f);
    else groups.push({ key, kickoffUtc: f.kickoffUtc, fixtures: [f] });
  }
  return groups;
}
