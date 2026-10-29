import { router, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Crest } from '@/components/ui/crest';
import type { Fixture } from '@/domain/types';
import { dayLabel, formatTime } from '@/lib/dates';

/** Upcoming fixtures grouped in one card, with VS between the crests, as in the mockup. */
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
          <View className="w-[62px]">
            <Text className="text-[13px] font-bold text-white">{formatTime(f.kickoffUtc)}</Text>
            <Text className="text-[11px] text-muted">{dayLabel(f.kickoffUtc)}</Text>
          </View>
          <Crest team={f.home} size={30} />
          <Text className="w-10 text-center text-[11px] font-bold text-muted">VS</Text>
          <Crest team={f.away} size={30} />
          <View className="ml-3 flex-1">
            <Text numberOfLines={1} className="text-[13px] font-semibold text-white">
              {f.home.shortName}
            </Text>
            <Text numberOfLines={1} className="text-[13px] font-semibold text-soft">
              {f.away.shortName}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
