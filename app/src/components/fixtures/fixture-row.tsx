import { router, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Crest } from '@/components/ui/crest';
import { GLOW, GLOW_SOFT } from '@/components/ui/glow';
import type { Fixture } from '@/domain/types';
import { dayLabel, formatTime } from '@/lib/dates';

function Centre({ f }: { f: Fixture }) {
  if (f.status === 'finished') {
    return (
      <>
        <Text className="text-[17px] font-extrabold text-white">{f.score.home} - {f.score.away}</Text>
        <Text className="text-[10px] font-semibold tracking-wide text-muted">FT</Text>
      </>
    );
  }
  if (f.status === 'live' || f.status === 'halftime') {
    return (
      <>
        <Text className="text-[17px] font-extrabold text-white">{f.score.home} - {f.score.away}</Text>
        <Text className={`text-[11px] font-bold ${f.paused ? 'text-warn' : 'text-live'}`}>
          {f.status === 'halftime' ? 'HT' : f.minute === null ? 'LIVE' : `${f.minute}'`}
        </Text>
      </>
    );
  }
  return (
    <>
      <Text className="text-[15px] font-bold text-white">{formatTime(f.kickoffUtc)}</Text>
      <Text className="text-[10px] font-medium text-muted">{dayLabel(f.kickoffUtc)}</Text>
    </>
  );
}

export function FixtureRow({ fixture, highlight = false }: { fixture: Fixture; highlight?: boolean }) {
  const live = fixture.status === 'live' || fixture.status === 'halftime';
  return (
    <Pressable
      onPress={() => router.push(`/match/${fixture.id}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={`${fixture.home.name} versus ${fixture.away.name}`}
      className={`mt-2 flex-row items-center rounded-2xl border bg-surface px-3 py-2.5 ${
        highlight ? 'border-neon/70' : live ? 'border-neon/40' : 'border-neon/15'
      }`}
      style={highlight ? GLOW : live ? GLOW_SOFT : undefined}>
      {live ? (
        <View className={`mr-2 rounded-md px-1.5 py-0.5 ${fixture.paused ? 'bg-warn/20' : 'bg-live/20'}`}>
          <Text className={`text-[9px] font-extrabold ${fixture.paused ? 'text-warn' : 'text-live'}`}>LIVE</Text>
        </View>
      ) : null}
      <View className="flex-1 flex-row items-center gap-2">
        <Crest team={fixture.home} />
        <Text numberOfLines={1} className="flex-1 text-[13px] font-semibold text-white">
          {fixture.home.shortName}
        </Text>
      </View>
      <View className="w-[60px] items-center">
        <Centre f={fixture} />
      </View>
      <View className="flex-1 flex-row items-center justify-end gap-2">
        <Text numberOfLines={1} className="flex-1 text-right text-[13px] font-semibold text-white">
          {fixture.away.shortName}
        </Text>
        <Crest team={fixture.away} />
      </View>
    </Pressable>
  );
}
