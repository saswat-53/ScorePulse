import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { MatchDetail, MatchEvent } from '@/domain/types';

function EventIcon({ e }: { e: MatchEvent }) {
  if (e.type === 'goal') {
    return (
      <View className="h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-neon bg-neon/20">
        <View className="h-2 w-2 rounded-full bg-neon" />
      </View>
    );
  }
  if (e.type === 'card') {
    return <View className={`h-5 w-3.5 rounded-[3px] ${e.detail === 'red-card' ? 'bg-danger' : 'bg-card'}`} />;
  }
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d="M4 9h13l-3-3" stroke="#19E3FF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M20 15H7l3 3" stroke="#FF3B47" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function EventText({ e, m }: { e: MatchEvent; m: MatchDetail }) {
  if (e.type === 'goal') {
    const after = e.scoreAfter
      ? `${m.home.shortName} ${e.scoreAfter.home} - ${e.scoreAfter.away} ${m.away.shortName}`
      : null;
    const title = e.detail === 'penalty' ? 'GOAL! (pen)' : e.detail === 'own-goal' ? 'OWN GOAL' : 'GOAL!';
    return (
      <>
        <Text className="text-sm font-extrabold text-neon">{title}</Text>
        <Text className="text-[13px] font-semibold text-white">{e.player}</Text>
        {after ? <Text className="text-xs text-soft">{after}</Text> : null}
      </>
    );
  }
  if (e.type === 'card') {
    return (
      <>
        <Text className="text-sm font-bold text-white">{e.detail === 'red-card' ? 'Red Card' : 'Yellow Card'}</Text>
        <Text className="text-[13px] text-soft">{e.player}</Text>
      </>
    );
  }
  return (
    <>
      <Text className="text-sm font-bold text-white">Substitution</Text>
      <Text className="text-[13px] text-white">
        {e.player} <Text className="font-bold text-danger">OFF</Text>
      </Text>
      <Text className="text-[13px] text-white">
        {e.related} <Text className="font-bold text-live">ON</Text>
      </Text>
    </>
  );
}

/** Events newest first, in one card as in the mockup. Goals cancelled by VAR are hidden (ADR 0009). */
export function Timeline({ match }: { match: MatchDetail }) {
  const events = match.events
    .filter((e) => !e.removed && e.type !== 'var')
    .sort((a, b) => b.minute - a.minute || (b.extra ?? 0) - (a.extra ?? 0));

  if (events.length === 0) {
    return <Text className="mx-4 mt-6 text-center text-[13px] text-muted">Nothing has happened yet.</Text>;
  }

  return (
    <View className="mx-4 mt-3 overflow-hidden rounded-2xl border border-neon/20 bg-surface">
      <View className="absolute bottom-5 left-[58px] top-5 w-0.5 bg-neon/25" />
      {events.map((e, i) => (
        <View
          key={e.id}
          className={`flex-row items-center gap-2.5 px-3 py-3 ${i < events.length - 1 ? 'border-b border-neon/10' : ''}`}>
          <Text className="w-[30px] text-right text-[13px] font-semibold text-soft">{e.minute}&apos;</Text>
          <View className="h-[30px] w-[30px] items-center justify-center bg-surface">
            <EventIcon e={e} />
          </View>
          <View className="flex-1">
            <EventText e={e} m={match} />
          </View>
        </View>
      ))}
    </View>
  );
}
