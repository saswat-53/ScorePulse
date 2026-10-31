import { router, type Href } from 'expo-router';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Crest } from '@/components/ui/crest';
import { GLOW, GLOW_SOFT } from '@/components/ui/glow';
import { Icon } from '@/components/ui/icon';
import type { Fixture, Team } from '@/domain/types';

function Side({ team }: { team: Team }) {
  return (
    <View className="flex-1 items-center gap-1.5">
      <Crest team={team} size={44} />
      <Text numberOfLines={1} className="text-xs font-semibold text-white">
        {team.shortName}
      </Text>
    </View>
  );
}

/** A live match as in the mockup: LIVE badge over the minute, stacked crests, score, chevron. */
export const LiveCard = memo(function LiveCard({ fixture, highlight }: { fixture: Fixture; highlight: boolean }) {
  const tone = fixture.paused ? 'text-warn' : 'text-live';
  const toneBg = fixture.paused ? 'bg-warn/15 border-warn/50' : 'bg-live/15 border-live/50';
  return (
    <Pressable
      onPress={() => router.push(`/match/${fixture.id}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={`${fixture.home.name} versus ${fixture.away.name}, live`}
      className={`mt-2.5 flex-row items-center rounded-2xl border bg-surface py-3 pl-2.5 pr-2 ${
        highlight ? 'border-neon/70' : 'border-neon/40'
      }`}
      style={highlight ? GLOW : GLOW_SOFT}>
      <View className={`h-[46px] w-9 items-center justify-center rounded-lg border ${toneBg}`}>
        <Text className={`text-[9px] font-extrabold ${tone}`}>LIVE</Text>
        <Text className={`text-xs font-bold ${tone}`}>
          {fixture.status === 'halftime' ? 'HT' : fixture.minute === null ? 'LIVE' : `${fixture.minute}'`}
        </Text>
      </View>
      <Side team={fixture.home} />
      <Text className="min-w-[64px] text-center text-2xl font-extrabold text-white">
        {fixture.score.home} - {fixture.score.away}
      </Text>
      <Side team={fixture.away} />
      <Icon name="chevron-right" size={18} color="#8FA3C0" />
    </Pressable>
  );
});
