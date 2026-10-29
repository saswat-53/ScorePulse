import { Text, View } from 'react-native';

import type { MatchDetail } from '@/domain/types';

export function Stats({ match }: { match: MatchDetail }) {
  if (!match.stats) {
    return <Text className="mx-4 mt-6 text-center text-[13px] text-muted">Stats are not available yet.</Text>;
  }
  return (
    <View className="mx-4 mt-4 rounded-2xl border border-neon/25 bg-surface px-4 pb-3 pt-1">
      {match.stats.map((s) => {
        const total = s.home + s.away || 1;
        return (
          <View key={s.key} className="pt-3.5">
            <View className="flex-row items-baseline justify-between">
              <Text className="w-14 text-[13px] font-extrabold text-white">
                {s.home}
                {s.unit ?? ''}
              </Text>
              <Text className="text-xs font-medium text-soft">{s.label}</Text>
              <Text className="w-14 text-right text-[13px] font-extrabold text-white">
                {s.away}
                {s.unit ?? ''}
              </Text>
            </View>
            <View className="mt-1.5 h-1.5 flex-row gap-1">
              <View className="flex-1 flex-row justify-end overflow-hidden rounded-[3px] bg-white/10">
                <View style={{ width: `${(s.home / total) * 100}%`, backgroundColor: match.home.color }} />
              </View>
              <View className="flex-1 overflow-hidden rounded-[3px] bg-white/10">
                <View style={{ width: `${(s.away / total) * 100}%`, backgroundColor: match.away.color }} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
