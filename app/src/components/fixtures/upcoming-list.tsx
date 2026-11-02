import { router, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Crest } from '@/components/ui/crest';
import type { Fixture } from '@/domain/types';
import { dayLabel, formatTime } from '@/lib/dates';

/** Upcoming fixtures grouped in one card: kickoff on the left, then the home crest and name, VS in the middle, and the away name and crest at the right edge. */
export function UpcomingList({ fixtures }: { fixtures: Fixture[] }) {
  return (
    <View className="mt-2.5 overflow-hidden rounded-2xl border border-neon/20 bg-surface">
      {fixtures.map((f, i) => (
        <Pressable
          key={f.id}
          onPress={() => router.push(`/match/${f.id}` as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${f.home.name} versus ${f.away.name}`}
          className={`h-14 flex-row items-center px-3.5 ${i < fixtures.length - 1 ? 'border-b border-neon/10' : ''}`}>
          <View className="w-[58px]">
            <Text className="text-[13px] font-bold text-white">{formatTime(f.kickoffUtc)}</Text>
            <Text className="text-[11px] text-muted">{dayLabel(f.kickoffUtc)}</Text>
          </View>
          <View className="flex-1 flex-row items-center gap-1.5">
            <Crest team={f.home} size={28} />
            <Text numberOfLines={1} className="flex-1 text-[12px] font-semibold text-white">
              {f.home.shortName}
            </Text>
          </View>
          <Text className="w-10 text-center text-[10px] font-bold text-muted">VS</Text>
          <View className="flex-1 flex-row items-center justify-end gap-1.5">
            <Text numberOfLines={1} className="flex-1 text-right text-[12px] font-semibold text-white">
              {f.away.shortName}
            </Text>
            <Crest team={f.away} size={28} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}
