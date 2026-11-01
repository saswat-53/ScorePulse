import { Text, View } from 'react-native';

import { LEAGUES } from '@/domain/mock';
import type { MatchDetail } from '@/domain/types';
import { dayLabel, formatTime } from '@/lib/dates';

export function Overview({ match }: { match: MatchDetail }) {
  // The providers' free data has no round or venue yet, so a row with nothing to say is left out, not shown as "-".
  const rows = (
    [
      ['Competition', LEAGUES.find((l) => l.id === match.leagueId)?.name ?? ''],
      ['Round', match.round ?? ''],
      ['Venue', match.venue ?? ''],
      ['Kickoff', `${dayLabel(match.kickoffUtc)}, ${formatTime(match.kickoffUtc)}`],
    ] as [string, string][]
  ).filter(([, value]) => value !== '');
  return (
    <View className="mx-4 mt-4 rounded-2xl border border-neon/20 bg-surface px-4">
      {rows.map(([k, v], i) => (
        <View
          key={k}
          className={`flex-row items-center justify-between py-3.5 ${i < rows.length - 1 ? 'border-b border-neon/10' : ''}`}>
          <Text className="text-[13px] text-muted">{k}</Text>
          <Text className="text-[13px] font-semibold text-white">{v}</Text>
        </View>
      ))}
    </View>
  );
}
