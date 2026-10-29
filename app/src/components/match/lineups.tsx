import { Text, View } from 'react-native';

import type { Lineup, LineupPlayer, MatchDetail } from '@/domain/types';

interface Placed {
  id: number;
  name: string;
  number: number;
  x: string;
  y: string;
}

/** Turns API-Football grid cells ("row:column", row 1 = goalkeeper) into pitch positions. */
function place(lineup: Lineup, top: boolean): Placed[] {
  const rows = new Map<number, LineupPlayer[]>();
  for (const p of lineup.starters) {
    const row = Number(p.grid?.split(':')[0] ?? 1);
    rows.set(row, [...(rows.get(row) ?? []), p]);
  }
  const rowCount = Math.max(...rows.keys());
  const out: Placed[] = [];
  for (const [row, players] of rows) {
    const sorted = [...players].sort((a, b) => Number(a.grid?.split(':')[1]) - Number(b.grid?.split(':')[1]));
    const depth = 0.075 + ((row - 1) * 0.37) / Math.max(1, rowCount - 1);
    sorted.forEach((p, i) => {
      out.push({
        id: p.id,
        name: p.name,
        number: p.number,
        x: `${(((i + 1) / (sorted.length + 1)) * 100).toFixed(1)}%`,
        y: `${((top ? depth : 1 - depth) * 100).toFixed(1)}%`,
      });
    });
  }
  return out;
}

export function Lineups({ match }: { match: MatchDetail }) {
  const home = match.lineups?.find((l) => l.teamId === match.home.id);
  const away = match.lineups?.find((l) => l.teamId === match.away.id);

  if (!home || !away) {
    return (
      <Text className="mx-4 mt-6 text-center text-[13px] text-muted">
        Lineups appear when they are announced.
      </Text>
    );
  }

  const dots = [
    ...place(away, true).map((p) => ({ ...p, bg: match.away.color, fg: '#050B18' })),
    ...place(home, false).map((p) => ({ ...p, bg: '#F4F4F8', fg: '#0B1226' })),
  ];

  return (
    <View>
      <View className="flex-row justify-between px-4 pb-1.5 pt-2.5">
        <Text className="text-xs font-semibold" style={{ color: match.away.color }}>
          {match.away.shortName} <Text className="font-medium text-muted">{away.formation}</Text>
        </Text>
        <Text className="text-xs font-semibold" style={{ color: match.home.color }}>
          {match.home.shortName} <Text className="font-medium text-muted">{home.formation}</Text>
        </Text>
      </View>

      <View className="mx-4 h-[390px] overflow-hidden rounded-2xl border border-neon/35 bg-[#062033]">
        <View className="absolute left-0 right-0 top-1/2 h-px bg-neon/30" />
        <View className="absolute left-1/2 top-1/2 -ml-[42px] -mt-[42px] h-[84px] w-[84px] rounded-full border border-neon/30" />
        <View className="absolute inset-x-[28%] top-0 h-12 border border-t-0 border-neon/30" />
        <View className="absolute inset-x-[28%] bottom-0 h-12 border border-b-0 border-neon/30" />
        {dots.map((p) => (
          <View
            key={p.id}
            className="absolute -ml-[35px] -mt-[17px] w-[70px] items-center gap-0.5"
            style={{ left: p.x as `${number}%`, top: p.y as `${number}%` }}>
            <View
              className="h-[26px] w-[26px] items-center justify-center rounded-full"
              style={{ backgroundColor: p.bg }}>
              <Text className="text-[11px] font-extrabold" style={{ color: p.fg }}>
                {p.number}
              </Text>
            </View>
            <Text className="text-[10px] font-semibold text-white">{p.name}</Text>
          </View>
        ))}
      </View>

      <Text className="mx-4 mt-2.5 text-xs text-muted">
        Substitutes:{' '}
        <Text className="text-white">
          {[...home.substitutes, ...away.substitutes].map((p) => p.name).join(', ')}
        </Text>
      </Text>
    </View>
  );
}
